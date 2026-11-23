import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import type { RevealResponse } from '../../../core/models/application.model';
import { ApplicationApiService } from '../../../core/services/application-api.service';
import { AUTO_HIDE_MS, MaskedFieldComponent } from './masked-field.component';

describe('MaskedFieldComponent', () => {
  let fixture: ComponentFixture<MaskedFieldComponent>;
  let el: HTMLElement;
  let revealField: ReturnType<typeof vi.fn>;

  function create(inputs: { canReveal?: boolean; maskedValue?: string } = {}): void {
    revealField = vi.fn(() =>
      of<RevealResponse>({ field: 'bank.accountNumber', value: '0000012345' }),
    );
    TestBed.configureTestingModule({
      imports: [MaskedFieldComponent],
      providers: [{ provide: ApplicationApiService, useValue: { revealField } }],
    });
    fixture = TestBed.createComponent(MaskedFieldComponent);
    fixture.componentRef.setInput('label', 'Account number');
    fixture.componentRef.setInput('field', 'bank.accountNumber');
    fixture.componentRef.setInput('applicationId', 'app-007');
    fixture.componentRef.setInput('maskedValue', inputs.maskedValue ?? '••••2345');
    fixture.componentRef.setInput('canReveal', inputs.canReveal ?? true);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  const text = () => el.textContent!.replace(/\s+/g, ' ').trim();
  const button = (label: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  function clickReveal(): void {
    button('Reveal account number')!.click();
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  describe('permissions', () => {
    it('hides the Reveal button when canReveal is false, showing only the masked value', () => {
      create({ canReveal: false });

      expect(el.querySelector('button')).toBeNull();
      expect(text()).toContain('••••2345');
    });

    it('shows a Reveal button with an accessible label when canReveal is true', () => {
      create();

      const reveal = button('Reveal account number');
      expect(reveal).not.toBeNull();
      expect(reveal!.textContent!.trim()).toBe('Reveal');
    });

    it('shows "Not provided" and no button when there is no value', () => {
      create({ maskedValue: '' });

      expect(text()).toBe('Not provided');
      expect(el.querySelector('button')).toBeNull();
    });
  });

  describe('revealing', () => {
    it('calls revealField and shows the full value with a Hide button', () => {
      create();

      clickReveal();

      expect(revealField).toHaveBeenCalledWith('app-007', 'bank.accountNumber');
      expect(text()).toContain('0000012345');
      expect(text()).not.toContain('••••2345');
      expect(button('Hide account number')).not.toBeNull();
      expect(button('Reveal account number')).toBeNull();
    });

    it('shows a loading state while the request is in flight', () => {
      create();
      const response = new Subject<RevealResponse>();
      revealField.mockReturnValue(response);

      clickReveal();

      const pending = button('Reveal account number')!;
      expect(pending.disabled).toBe(true);
      expect(pending.textContent).toContain('Revealing…');

      response.next({ field: 'bank.accountNumber', value: '0000012345' });
      response.complete();
      fixture.detectChanges();
      expect(text()).toContain('0000012345');
    });

    it('Hide puts the masked value back', () => {
      create();
      clickReveal();

      button('Hide account number')!.click();
      fixture.detectChanges();

      expect(text()).toContain('••••2345');
      expect(text()).not.toContain('0000012345');
    });

    it('wraps the value in an aria-live="polite" region so the change is announced', () => {
      create();
      clickReveal();

      expect(el.querySelector('[aria-live="polite"]')!.textContent).toContain('0000012345');
    });
  });

  describe('auto-hide', () => {
    it('hides the revealed value again after 30 seconds', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      create();
      clickReveal();
      expect(text()).toContain('0000012345');

      vi.advanceTimersByTime(AUTO_HIDE_MS - 1);
      fixture.detectChanges();
      expect(text()).toContain('0000012345'); // still visible just before 30s

      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(text()).not.toContain('0000012345');
      expect(text()).toContain('••••2345');
      expect(button('Reveal account number')).not.toBeNull();
    });

    it('clears the revealed value when the inputs change to another application', () => {
      create();
      clickReveal();

      fixture.componentRef.setInput('applicationId', 'app-008');
      fixture.componentRef.setInput('maskedValue', '••••9999');
      fixture.detectChanges();

      expect(text()).not.toContain('0000012345');
      expect(text()).toContain('••••9999');
    });

    it('clears the revealed value when the component is destroyed', () => {
      create();
      clickReveal();
      const component = fixture.componentInstance as unknown as {
        revealedValue: () => string | null;
      };
      expect(component.revealedValue()).toBe('0000012345');

      fixture.destroy();

      expect(component.revealedValue()).toBeNull();
    });
  });

  describe('errors', () => {
    it('shows a short inline message on 403 and keeps the value masked', () => {
      create();
      revealField.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
      );

      clickReveal();

      expect(text()).toContain("You're not allowed to see this value.");
      expect(text()).toContain('••••2345');
      expect(button('Reveal account number')!.disabled).toBe(false); // can try again
    });

    it('shows a retry message for other errors', () => {
      create();
      revealField.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
      );

      clickReveal();

      expect(text()).toContain("Couldn't reveal the value. Try again.");
    });
  });

  describe('storage', () => {
    it('never writes the revealed value to localStorage or sessionStorage', () => {
      const setLocal = vi.spyOn(Storage.prototype, 'setItem');
      create();

      clickReveal();

      const leaked = setLocal.mock.calls.some(([, value]) => String(value).includes('0000012345'));
      expect(leaked).toBe(false);
      setLocal.mockRestore();
    });
  });
});
