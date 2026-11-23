import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { FormControl } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import type { MerchantApplication } from '../../core/models/application.model';
import { ApplicationApiService } from '../../core/services/application-api.service';
import { type ApplicationForm, buildApplicationForm } from './application-form';
import { DraftAutosaveService } from './draft-autosave.service';

const savedApp = (id: string) => ({ id, status: 'DRAFT' }) as MerchantApplication;

describe('DraftAutosaveService', () => {
  let api: {
    createDraft: ReturnType<typeof vi.fn>;
    saveDraft: ReturnType<typeof vi.fn>;
  };
  let service: DraftAutosaveService;
  let form: ApplicationForm;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers(); // controls debounceTime (RxJS uses setTimeout)

    api = {
      createDraft: vi.fn(() => of(savedApp('app-100'))),
      saveDraft: vi.fn((id: string) => of(savedApp(id))),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApplicationApiService, useValue: api },
        DraftAutosaveService, // not auto-provided: normally provided by the wizard component
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    service = TestBed.inject(DraftAutosaveService);
    form = TestBed.runInInjectionContext(() => buildApplicationForm());
    service.connect(form);
  });

  afterEach(() => vi.useRealTimers());

  /** Like a user typing: setValue() alone doesn't mark a control dirty, real input does. */
  function type(control: FormControl<string>, value: string): void {
    control.markAsDirty();
    control.setValue(value);
  }

  const legalName = () => form.controls.business.controls.legalName;
  const tradingName = () => form.controls.business.controls.tradingName;

  describe('debounce', () => {
    it('saves exactly once, 1 second after the last change, not once per change', () => {
      type(legalName(), 'H');
      vi.advanceTimersByTime(300);
      type(legalName(), 'Him');
      vi.advanceTimersByTime(300);
      type(legalName(), 'Himalayan Coffee');

      vi.advanceTimersByTime(999);
      expect(api.createDraft).not.toHaveBeenCalled(); // still waiting for the pause

      vi.advanceTimersByTime(1);
      expect(api.createDraft).toHaveBeenCalledTimes(1);
      expect(api.createDraft.mock.calls[0][0].business.legalName).toBe('Himalayan Coffee');
    });

    it('does not save again when the value is unchanged', () => {
      type(legalName(), 'Himalayan Coffee');
      vi.advanceTimersByTime(1000);
      type(legalName(), 'Himalayan Coffee');
      vi.advanceTimersByTime(1000);

      expect(api.createDraft).toHaveBeenCalledTimes(1);
      expect(api.saveDraft).not.toHaveBeenCalled();
    });

    it('does not save changes that were not made by the user (pristine form)', () => {
      legalName().setValue('Loaded from server'); // e.g. programmatic fill, form stays pristine
      vi.advanceTimersByTime(1000);

      expect(api.createDraft).not.toHaveBeenCalled();
    });
  });

  describe('create then update', () => {
    it('calls createDraft first, then saveDraft with the returned id', () => {
      type(legalName(), 'Himalayan Coffee');
      vi.advanceTimersByTime(1000);
      type(tradingName(), 'Himalayan');
      vi.advanceTimersByTime(1000);

      expect(api.createDraft).toHaveBeenCalledTimes(1);
      expect(api.saveDraft).toHaveBeenCalledTimes(1);
      expect(api.saveDraft.mock.calls[0][0]).toBe('app-100');
      expect(service.draftId()).toBe('app-100');
    });

    it('replaces the URL with /applications/:id/edit after the draft is created', () => {
      type(legalName(), 'Himalayan Coffee');
      vi.advanceTimersByTime(1000);

      expect(navigate).toHaveBeenCalledWith(['/applications', 'app-100', 'edit'], {
        replaceUrl: true,
      });
    });

    it('never calls createDraft twice when changes happen while the first save is in flight', () => {
      const createResponse = new Subject<MerchantApplication>();
      api.createDraft.mockReturnValue(createResponse); // first save stays in flight

      type(legalName(), 'Himalayan Coffee');
      vi.advanceTimersByTime(1000);
      expect(api.createDraft).toHaveBeenCalledTimes(1);
      expect(service.saveStatus()).toBe('saving');

      // More typing while createDraft hasn't answered yet: this save is queued (concatMap).
      type(tradingName(), 'Himalayan');
      vi.advanceTimersByTime(1000);
      expect(api.createDraft).toHaveBeenCalledTimes(1);
      expect(api.saveDraft).not.toHaveBeenCalled();

      // The create finishes: the queued save runs as an UPDATE with the new id and latest data.
      createResponse.next(savedApp('app-100'));
      createResponse.complete();

      expect(api.createDraft).toHaveBeenCalledTimes(1);
      expect(api.saveDraft).toHaveBeenCalledTimes(1);
      expect(api.saveDraft.mock.calls[0][0]).toBe('app-100');
      expect(api.saveDraft.mock.calls[0][1].business.tradingName).toBe('Himalayan');
      expect(service.saveStatus()).toBe('saved');
    });

    it('saves to an existing draft (edit mode) without creating one', () => {
      service.useDraft('app-007');

      type(legalName(), 'Edited name');
      vi.advanceTimersByTime(1000);

      expect(api.createDraft).not.toHaveBeenCalled();
      expect(api.saveDraft).toHaveBeenCalledWith('app-007', expect.anything());
    });
  });

  describe('status', () => {
    it('goes saving → saved and records lastSavedAt', () => {
      const response = new Subject<MerchantApplication>();
      api.createDraft.mockReturnValue(response);
      expect(service.saveStatus()).toBe('idle');

      type(legalName(), 'Himalayan Coffee');
      vi.advanceTimersByTime(1000);
      expect(service.saveStatus()).toBe('saving');

      response.next(savedApp('app-100'));
      response.complete();
      expect(service.saveStatus()).toBe('saved');
      expect(service.lastSavedAt()).toBeInstanceOf(Date);
    });
  });

  describe('errors', () => {
    const serverError = () =>
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' }));

    beforeEach(() => service.useDraft('app-007'));

    it('sets status to error and leaves the form values exactly as typed', () => {
      api.saveDraft.mockReturnValueOnce(serverError());

      type(legalName(), 'Typed by the user');
      type(tradingName(), 'Typed too');
      vi.advanceTimersByTime(1000);

      expect(service.saveStatus()).toBe('error');
      expect(legalName().value).toBe('Typed by the user');
      expect(tradingName().value).toBe('Typed too');
      expect(form.dirty).toBe(true); // still marked as unsaved
    });

    it('keeps the stream alive: the next change after a failure triggers a new save', () => {
      api.saveDraft.mockReturnValueOnce(serverError());

      type(legalName(), 'First attempt');
      vi.advanceTimersByTime(1000);
      expect(service.saveStatus()).toBe('error');

      type(legalName(), 'Second attempt');
      vi.advanceTimersByTime(1000);

      expect(api.saveDraft).toHaveBeenCalledTimes(2);
      expect(api.saveDraft.mock.calls[1][1].business.legalName).toBe('Second attempt');
      expect(service.saveStatus()).toBe('saved');
    });

    it('saveNow() retries after a failure and reports the error to its caller', () => {
      api.saveDraft.mockReturnValueOnce(serverError());
      const onError = vi.fn();

      type(legalName(), 'Save me');
      service.saveNow().subscribe({ error: onError });
      expect(onError).toHaveBeenCalled();
      expect(service.saveStatus()).toBe('error');

      let savedId: string | undefined;
      service.saveNow().subscribe((id) => (savedId = id));
      expect(savedId).toBe('app-007');
      expect(service.saveStatus()).toBe('saved');
    });
  });
});
