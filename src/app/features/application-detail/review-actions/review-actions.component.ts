import { LowerCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type AbstractControl, ReactiveFormsModule, type ValidatorFn } from '@angular/forms';
import { finalize } from 'rxjs';
import type {
  DecisionPayload,
  MerchantApplication,
  ValidationErrorResponse,
} from '../../../core/models/application.model';
import { ApplicationApiService } from '../../../core/services/application-api.service';
import { watchFormGroup } from '../../../shared/forms/watch-form-group';
import { errorMessage, shouldShowError } from '../../../shared/validators/error-messages';
import { serverError } from '../../../shared/validators/merchant.validators';
import { buildDecisionForm, MAX_NOTES, MIN_REJECTION_NOTES } from './decision-form';

const CONFLICT_MESSAGE =
  'This application was updated by someone else. Showing the latest version.';

const DECISION_LABELS = { APPROVED: 'Approve', REJECTED: 'Reject' } as const;
const RISK_LABELS = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' } as const;

/**
 * The assigned reviewer's controls: "Start review" (SUBMITTED) and the decision form
 * (IN_REVIEW). The parent only renders this for the assigned reviewer; the server enforces
 * the same rule (403) whatever the UI shows.
 *
 * Emits `changed` (with a notice for the user) whenever the parent should reload: after a
 * successful action, or a 409 meaning someone else changed it first. The PARENT shows the
 * notice, because after reloading this component may no longer be on the page (e.g. the
 * application is now REJECTED and has no reviewer controls).
 */
@Component({
  selector: 'app-review-actions',
  imports: [ReactiveFormsModule, LowerCasePipe],
  templateUrl: './review-actions.component.html',
  styleUrl: './review-actions.component.scss',
})
export class ReviewActionsComponent {
  private readonly api = inject(ApplicationApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly application = input.required<MerchantApplication>();
  /** Ask the parent to reload, with a notice to show (it survives this component being removed). */
  readonly changed = output<string>();

  protected readonly form = buildDecisionForm();
  protected readonly minRejectionNotes = MIN_REJECTION_NOTES;
  protected readonly maxNotes = MAX_NOTES;
  protected readonly decisionLabels = DECISION_LABELS;
  protected readonly riskLabels = RISK_LABELS;
  protected readonly decisionOptions = ['APPROVED', 'REJECTED'] as const;
  protected readonly riskOptions = ['LOW', 'MEDIUM', 'HIGH'] as const;

  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  /** Snapshot shown in the confirmation dialog (what will actually be sent). */
  protected readonly pending = signal<DecisionPayload | null>(null);

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('confirmDialog');
  /** Keeps this OnPush view in sync when the form changes from code (touched, server errors). */
  private readonly formState = watchFormGroup(signal(this.form));
  private serverValidators: { control: AbstractControl; validator: ValidatorFn }[] = [];

  /* ------------------------------ start review ------------------------------ */

  protected startReview(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(null);

    this.api
      .startReview(this.application().id)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.changed.emit('Review started. You can now record a decision.'),
        error: (err: unknown) => this.handleError(err),
      });
  }

  /* -------------------------------- decision -------------------------------- */

  /** First step: validate, then ask for confirmation (nothing is sent yet). */
  protected requestConfirmation(): void {
    this.clearServerErrors();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    const { decision, riskLevel, notes } = this.form.getRawValue();
    this.pending.set({
      decision: decision as DecisionPayload['decision'],
      riskLevel: riskLevel as DecisionPayload['riskLevel'],
      notes: notes.trim(),
    });
    this.openDialog();
  }

  protected cancelConfirmation(): void {
    this.closeDialog();
  }

  /** Second step: the user confirmed in the dialog. */
  protected confirmDecision(): void {
    const payload = this.pending();
    if (!payload || this.busy()) return;

    this.busy.set(true);
    this.message.set(null);
    this.form.disable({ emitEvent: false });

    this.api
      .submitDecision(this.application().id, payload)
      .pipe(
        finalize(() => {
          this.busy.set(false);
          this.form.enable({ emitEvent: false });
          this.closeDialog();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () =>
          this.changed.emit(
            `Decision recorded: ${payload.decision === 'APPROVED' ? 'approved' : 'rejected'}.`,
          ),
        error: (err: unknown) => this.handleError(err),
      });
  }

  /** Called when the dialog closes in any way (buttons, Escape key). */
  protected onDialogClosed(): void {
    this.pending.set(null);
  }

  /* --------------------------------- errors --------------------------------- */

  private handleError(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.changed.emit(CONFLICT_MESSAGE); // reload to show the real current status
      return;
    }
    if (
      err instanceof HttpErrorResponse &&
      err.status === 422 &&
      Array.isArray(err.error?.errors)
    ) {
      this.applyServerErrors(err.error as ValidationErrorResponse);
      return;
    }
    this.message.set("Something went wrong and the action wasn't saved. Please try again.");
  }

  /** Same approach as the wizard: a serverError() validator survives re-validation. */
  private applyServerErrors(body: ValidationErrorResponse): void {
    for (const { field, message } of body.errors) {
      const control = this.form.get(field);
      if (!control) continue;
      const validator = serverError(message, control.value);
      control.addValidators(validator);
      control.updateValueAndValidity();
      control.markAsTouched();
      this.serverValidators.push({ control, validator });
    }
    this.message.set('Please fix the highlighted fields.');
    this.focusFirstInvalid();
  }

  private clearServerErrors(): void {
    for (const { control, validator } of this.serverValidators) {
      control.removeValidators(validator);
      control.updateValueAndValidity();
    }
    this.serverValidators = [];
  }

  /* ------------------------------ template helpers ----------------------------- */

  protected showError(control: AbstractControl): boolean {
    this.formState();
    return shouldShowError(control);
  }

  protected fieldError(control: AbstractControl, label: string): string | null {
    this.formState();
    return errorMessage(control.errors, label);
  }

  /** The conditional rejection-length error lives on the group; shown under Notes. */
  protected showNotesTooShort(): boolean {
    this.formState();
    return this.form.hasError('rejectionNotesTooShort') && this.form.controls.notes.touched;
  }

  protected notesInvalid(): boolean {
    return this.showError(this.form.controls.notes) || this.showNotesTooShort();
  }

  /* ------------------------------ dialog & focus ------------------------------ */

  /**
   * Native <dialog>: showModal() gives a real modal (focus moves in, Escape closes, page
   * behind is inert). Fallback to the `open` attribute where showModal isn't available.
   */
  private openDialog(): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  private closeDialog(): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      dialog.close(); // fires 'close' → onDialogClosed()
    } else {
      dialog.removeAttribute('open');
      this.onDialogClosed();
    }
  }

  private focusFirstInvalid(): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      { injector: this.injector },
    );
  }
}
