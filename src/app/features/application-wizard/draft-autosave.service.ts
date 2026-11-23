import { DestroyRef, inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  catchError,
  concatMap,
  debounceTime,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  merge,
  type Observable,
  of,
  ReplaySubject,
  Subject,
  tap,
} from 'rxjs';
import type {
  ApplicationDraftPayload,
  MerchantApplication,
} from '../../core/models/application.model';
import { ApplicationApiService } from '../../core/services/application-api.service';
import { type ApplicationForm, toDraftPayload } from './application-form';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** One save in the queue. `result` is only set for saveNow(), so its caller can wait for it. */
interface SaveRequest {
  payload: ApplicationDraftPayload;
  json: string;
  result?: Subject<string>;
}

const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Auto-saves the wizard's form as a draft.
 *
 * Provided in the WizardComponent's `providers` (autoProvided: false), not in root:
 * - each wizard gets its own instance and state (status, draftId)
 * - inject(DestroyRef) here is the COMPONENT's, so takeUntilDestroyed stops saving
 *   when the user leaves the wizard.
 */
@Service({ autoProvided: false })
export class DraftAutosaveService {
  private readonly api = inject(ApplicationApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _saveStatus = signal<SaveStatus>('idle');
  private readonly _lastSavedAt = signal<Date | null>(null);
  private readonly _draftId = signal<string | null>(null);
  /** Id of a draft created by THIS wizard session (so it isn't reloaded from the server). */
  private readonly _createdDraftId = signal<string | null>(null);

  readonly saveStatus = this._saveStatus.asReadonly();
  readonly lastSavedAt = this._lastSavedAt.asReadonly();
  readonly draftId = this._draftId.asReadonly();
  readonly createdDraftId = this._createdDraftId.asReadonly();

  private form: ApplicationForm | null = null;
  private readonly manualSaves$ = new Subject<SaveRequest>();

  /** Starts auto-saving `form`. Call once, from the wizard's constructor. */
  connect(form: ApplicationForm): void {
    this.form = form;

    const autoSaves$: Observable<SaveRequest> = form.valueChanges.pipe(
      // Wait until the user pauses typing for 1s, so we save once per pause, not per key.
      debounceTime(AUTOSAVE_DEBOUNCE_MS),
      map(() => toDraftPayload(form.getRawValue())),
      map((payload) => ({ payload, json: JSON.stringify(payload) })),
      // Skip if nothing that's actually sent has changed (e.g. focus/blur, retyping the
      // same text, or only the form-only confirmAccountNumber changed).
      distinctUntilChanged((a, b) => a.json === b.json),
      // Only save real user changes. Loading a draft with reset() leaves the form pristine.
      filter(() => form.dirty),
    );

    merge(autoSaves$, this.manualSaves$)
      .pipe(
        tap(() => this._saveStatus.set('saving')),
        /*
         * Why concatMap, not switchMap:
         * switchMap would UNSUBSCRIBE from (cancel) a save that's still in flight when the
         * next one starts. Cancelling an HTTP request in the browser doesn't stop the server:
         * the cancelled save may still be applied, possibly AFTER the newer one, leaving the
         * server with older data. Worse, cancelling the first createDraft loses the new id, so
         * the next save creates a second draft. concatMap runs saves one at a time, in order:
         * every save completes, the last one wins, and a save queued behind createDraft runs
         * after the id is known and becomes a saveDraft.
         */
        concatMap((request) =>
          defer(() => this.save(request.payload)).pipe(
            tap((saved) => {
              this.onSaved(request.json);
              request.result?.next(saved.id);
              request.result?.complete();
            }),
            /*
             * Why catchError is INSIDE the concatMap:
             * An error that reaches the outer pipeline completes it for good: auto-save would
             * silently stop working after the first failure. Caught here, only this one save
             * fails: we show the error, return EMPTY (no value, just complete), and the outer
             * stream keeps running so the next change or "Save now" tries again.
             * The form is never touched here: the user's input stays exactly as typed.
             */
            catchError((error: unknown) => {
              this._saveStatus.set('error');
              request.result?.error(error);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /** Edit mode: continue an existing draft instead of creating a new one. */
  useDraft(id: string): void {
    this._draftId.set(id);
  }

  /**
   * Why leaving now would lose work, or null if everything is saved:
   * - 'pending': changed but not saved yet (debounce still waiting, or nothing queued yet)
   * - 'saving':  a save is in flight or queued
   * - 'error':   the last save failed
   * After every successful save the form is marked pristine, so `dirty` means "unsaved".
   */
  unsavedReason(): 'pending' | 'saving' | 'error' | null {
    const status = this._saveStatus();
    if (status === 'saving') return 'saving';
    if (status === 'error') return 'error';
    if (this.form?.dirty) return 'pending';
    return null;
  }

  /**
   * Saves immediately (Next button, "Save now" button, before submit) and emits the draft id
   * once saved. Goes through the same queue as auto-saves, so it never runs in parallel with
   * one (no duplicate drafts). If there's nothing new to save, emits the current id at once.
   * Errors are also reflected in saveStatus; callers that don't need the result can ignore them.
   */
  saveNow(): Observable<string> {
    const form = this.form;
    if (!form) throw new Error('DraftAutosaveService.connect() must be called first');

    const id = this._draftId();
    if (id && !form.dirty) {
      return of(id);
    }

    const payload = toDraftPayload(form.getRawValue());
    // ReplaySubject: the caller still gets the result even if the save finishes before it
    // subscribes, or if it subscribes late.
    const result = new ReplaySubject<string>(1);
    this.manualSaves$.next({ payload, json: JSON.stringify(payload), result });
    return result.asObservable();
  }

  /** Create on the first save, update afterwards. Reads draftId when the save RUNS. */
  private save(payload: ApplicationDraftPayload): Observable<MerchantApplication> {
    const id = this._draftId();
    if (id) {
      return this.api.saveDraft(id, payload);
    }
    return this.api.createDraft(payload).pipe(
      tap((created) => {
        this._draftId.set(created.id);
        this._createdDraftId.set(created.id);
        // Put the id in the URL so a reload continues this draft. replaceUrl: Back doesn't
        // return to /applications/new (which would start a second, empty draft).
        void this.router.navigate(['/applications', created.id, 'edit'], { replaceUrl: true });
      }),
    );
  }

  private onSaved(savedJson: string): void {
    this._saveStatus.set('saved');
    this._lastSavedAt.set(new Date());

    // Mark the form "no unsaved changes", but only if the user hasn't typed more while the
    // request was in flight; otherwise those newer changes must stay dirty and get saved.
    const form = this.form;
    if (form && JSON.stringify(toDraftPayload(form.getRawValue())) === savedJson) {
      form.markAsPristine();
    }
  }
}
