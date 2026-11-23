import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import type { ValidationErrorResponse } from '../../core/models/application.model';
import { ApplicationApiService } from '../../core/services/application-api.service';
import { LoadStateComponent } from '../../shared/components/load-state/load-state.component';
import { httpStatusOf } from '../../shared/utils/http-status';
import { serverError } from '../../shared/validators/merchant.validators';
import type { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { buildApplicationForm, toFormValue } from './application-form';
import { DraftAutosaveService } from './draft-autosave.service';
import { BankStepComponent } from './steps/bank-step.component';
import { BusinessStepComponent } from './steps/business-step.component';
import { OwnerStepComponent } from './steps/owner-step.component';
import { ReviewStepComponent } from './steps/review-step.component';

const STEPS = [
  { key: 'business', label: 'Business info' },
  { key: 'owner', label: 'Owner info' },
  { key: 'bank', label: 'Bank details' },
  { key: 'review', label: 'Review & submit' },
] as const;

/** The form groups behind steps 0–2 (step 3 is the review). */
const GROUP_KEYS = ['business', 'owner', 'bank'] as const;
type GroupKey = (typeof GROUP_KEYS)[number];
const REVIEW_STEP = 3;

@Component({
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    LoadStateComponent,
    BusinessStepComponent,
    OwnerStepComponent,
    BankStepComponent,
    ReviewStepComponent,
  ],
  selector: 'app-application-wizard',
  styleUrl: './application-wizard.component.scss',
  templateUrl: './application-wizard.component.html',
  // One auto-save instance per wizard, destroyed with it (see DraftAutosaveService).
  providers: [DraftAutosaveService],
  // Tab close / reload / typing another URL never reaches the router, so the canDeactivate
  // guard can't see it; the browser's beforeunload event can.
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export default class ApplicationWizardComponent implements HasUnsavedChanges {
  private readonly api = inject(ApplicationApiService);
  protected readonly autosave = inject(DraftAutosaveService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** From the route: present on /applications/:id/edit, absent on /applications/new. */
  readonly id = input<string>();

  protected readonly steps = STEPS;
  protected readonly reviewStep = REVIEW_STEP;
  protected readonly form = buildApplicationForm();
  protected readonly currentStep = signal(0);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  /** Set right before navigating away after a successful submit: nothing left to protect. */
  private submitted = false;
  /** Server-error validators added after a 422, removed again on the next submit. */
  private serverValidators: { control: AbstractControl; validator: ValidatorFn }[] = [];
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  /* ---------------------------- edit mode loading --------------------------- */

  /**
   * Loads the draft in edit mode from the creator-only draft endpoint, which returns FULL
   * values (the regular detail endpoint masks sensitive fields, and editing masked values
   * would overwrite the real data).
   * Idle (no request) when there's no id, or when the id is a draft this wizard just created
   * via auto-save: the URL then changes to /applications/:id/edit, but the form already holds
   * the latest data, and reloading it would overwrite what the user is typing.
   */
  protected readonly existing = rxResource({
    params: () => {
      const id = this.id();
      return id && id !== this.autosave.createdDraftId() ? id : undefined;
    },
    stream: ({ params: id }) => this.api.getDraft(id),
  });
  private readonly existingApp = computed(() =>
    this.existing.hasValue() ? this.existing.value() : undefined,
  );
  /** The draft endpoint answers 409 once the application is submitted or decided. */
  protected readonly notEditable = computed(() => httpStatusOf(this.existing.error()) === 409);

  constructor() {
    this.autosave.connect(this.form);

    // Edit mode: once the draft has loaded, put it in the form and continue THIS draft.
    effect(() => {
      const app = this.existingApp();
      if (app?.status !== 'DRAFT') return;

      /*
       * emitEvent: false → no valueChanges (or statusChanges) event is emitted, so loading
       * never enters the auto-save pipeline: no debounce timer, no pointless save of data the
       * server just sent us, and no "Saving…" flash. The values are still written to the
       * inputs and validity is still recalculated; only the events are silenced.
       */
      this.form.patchValue(toFormValue(app), { emitEvent: false });
      // "No unsaved changes": the form now matches the server. Auto-save (filter on dirty)
      // and the leave guard both rely on this.
      this.form.markAsPristine();
      this.autosave.useDraft(app.id);
    });
  }

  /* --------------------------- leaving with unsaved work -------------------------- */

  /** Used by unsavedChangesGuard (in-app navigation). Null = safe to leave. */
  leaveWarning(nextUrl: string): string | null {
    if (this.submitted) return null;

    // Auto-save's own URL update (/applications/new → /applications/:id/edit) also passes
    // through this guard, because the route is reused. That's not leaving: allow it.
    const draftId = this.autosave.draftId();
    if (draftId && nextUrl.split(/[?#]/)[0] === `/applications/${draftId}/edit`) return null;

    switch (this.autosave.unsavedReason()) {
      case 'error':
        return "Your latest changes couldn't be saved. If you leave now, they'll be lost.\n\nLeave anyway?";
      case 'saving':
        return 'Your changes are still being saved. If you leave now, they may be lost.\n\nLeave anyway?';
      case 'pending':
        return "You have changes that haven't been saved yet. If you leave now, they'll be lost.\n\nLeave anyway?";
      default:
        return null;
    }
  }

  /**
   * Tab close / reload. Browsers show their OWN generic message ("Changes you made may not be
   * saved"); custom text is ignored for security reasons, so only whether to ask is decided here.
   */
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.submitted && this.autosave.unsavedReason() !== null) {
      event.preventDefault();
      event.returnValue = ''; // required by some older browsers to show the prompt
    }
  }

  /* ------------------------------- navigation ------------------------------- */

  /** Enter in a field submits the <form>: on steps 0–2 that means Next, on review Submit. */
  protected onFormSubmit(): void {
    if (this.currentStep() === REVIEW_STEP) {
      this.submit();
    } else {
      this.next();
    }
  }

  /** Validate only the current step's group; move on only if it's valid. */
  protected next(): void {
    const step = this.currentStep();
    if (step >= REVIEW_STEP) return;

    // Save what's been typed right away rather than waiting for the debounce. Drafts may be
    // incomplete, so this happens even if the step is invalid. Fire-and-forget: the user
    // isn't held up, and any failure already shows in the save status indicator.
    if (this.form.dirty) {
      this.autosave.saveNow().subscribe({ error: () => undefined });
    }

    const group = this.form.controls[GROUP_KEYS[step]];
    if (group.invalid) {
      group.markAllAsTouched(); // reveals every error in this step
      this.focusFirstInvalid();
      return;
    }
    this.setStep(step + 1);
  }

  /** Back is always allowed: nothing is lost, values stay in the form. */
  protected back(): void {
    if (this.currentStep() > 0) {
      this.setStep(this.currentStep() - 1);
    }
  }

  /** From the step indicator (completed steps) or the review's Edit links. Only backwards. */
  protected goToStep(index: number): void {
    if (index < this.currentStep()) {
      this.setStep(index);
    }
  }

  /* --------------------------------- submit --------------------------------- */

  protected submit(): void {
    if (this.submitting()) return;

    // Errors from a previous 422 must not block this attempt; the server will re-check.
    this.clearServerErrors();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.showFirstInvalidStep(GROUP_KEYS.filter((key) => this.form.controls[key].invalid));
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);

    // The server validates what it has STORED, so make sure the latest values are saved
    // first. saveNow() goes through the auto-save queue (no parallel or duplicate saves) and
    // emits the draft id at once if everything is already saved.
    this.autosave
      .saveNow()
      .pipe(
        switchMap((draftId) => this.api.submitApplication(draftId)),
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (submitted) => {
          this.submitted = true; // nothing left to protect: don't ask "leave?"
          void this.router.navigate(['/applications', submitted.id]);
        },
        error: (err: unknown) => this.handleSubmitError(err),
      });
  }

  private handleSubmitError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse)) {
      this.submitError.set('Something went wrong. Please try again.');
      return;
    }

    if (err.status === 422 && Array.isArray(err.error?.errors)) {
      this.applyServerErrors(err.error as ValidationErrorResponse);
      return;
    }

    const messages: Record<number, string> = {
      403: "You don't have permission to submit this application.",
      404: 'This application no longer exists.',
      409: 'This application has already been submitted and can no longer be changed.',
    };
    this.submitError.set(
      messages[err.status] ?? "We couldn't submit the application. Please try again.",
    );
  }

  /**
   * Puts each 422 field error on the matching control (field paths like "owner.email" match
   * the form structure), then jumps to the first step that has one.
   *
   * Each error is added as a serverError() validator rather than with setErrors(): the step
   * component is re-created when shown, which re-runs the validators and would wipe
   * setErrors(). The validator keeps the error while the field holds the rejected value and
   * clears it as soon as the user edits the field.
   */
  private applyServerErrors(body: ValidationErrorResponse): void {
    const affected: GroupKey[] = [];
    const unmatched: string[] = [];

    for (const { field, message } of body.errors) {
      const control = this.form.get(field);
      if (!control) {
        unmatched.push(message);
        continue;
      }
      const validator = serverError(message, control.value);
      control.addValidators(validator);
      control.updateValueAndValidity();
      control.markAsTouched();
      this.serverValidators.push({ control, validator });
      affected.push(field.split('.')[0] as GroupKey);
    }

    this.submitError.set(
      unmatched.length > 0
        ? `${body.message}: ${unmatched.join(' ')}`
        : 'Some fields need attention. Please fix the highlighted fields and submit again.',
    );
    this.showFirstInvalidStep(affected);
  }

  /** "Save now" button, shown when auto-save failed. */
  protected retrySave(): void {
    this.autosave.saveNow().subscribe({ error: () => undefined }); // status shows the outcome
  }

  private clearServerErrors(): void {
    for (const { control, validator } of this.serverValidators) {
      control.removeValidators(validator);
      control.updateValueAndValidity();
    }
    this.serverValidators = [];
  }

  /* ---------------------------- focus management ---------------------------- */

  private setStep(index: number): void {
    this.currentStep.set(index);
    this.submitError.set(null);
    // Move focus to the new step's heading so keyboard and screen-reader users start there.
    afterNextRender(() => this.stepHeading()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Jumps to the earliest step among `groups` and focuses its first invalid field. */
  private showFirstInvalidStep(groups: readonly GroupKey[]): void {
    const first = GROUP_KEYS.findIndex((key) => groups.includes(key));
    if (first !== -1) {
      this.currentStep.set(first);
    }
    this.focusFirstInvalid();
  }

  /**
   * Focuses the first field showing an error. Runs after the next render, because the
   * error state (and possibly the step itself) only appears in the DOM after change detection.
   */
  private focusFirstInvalid(): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      { injector: this.injector },
    );
  }
}
