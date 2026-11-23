import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import type { ApplicationForm } from '../application-form';

/**
 * Read-only summary of everything entered. Emits `edit` with the step index to jump back to.
 * The account number is masked so the full number isn't displayed again on screen.
 */
@Component({
  selector: 'app-review-step',
  imports: [DatePipe],
  templateUrl: './review-step.component.html',
  // Default OnPush is enough: this view is created fresh each time the user reaches the
  // review step, and the values can't change while it's shown.
})
export class ReviewStepComponent {
  readonly form = input.required<ApplicationForm>();
  /** Step index to edit: 0 business, 1 owner, 2 bank. */
  readonly edit = output<number>();

  /** "0000012345" → "•••• 2345". Short values are fully masked. */
  protected mask(accountNumber: string): string {
    return accountNumber.length > 4 ? `•••• ${accountNumber.slice(-4)}` : '••••';
  }

  protected lastFour(accountNumber: string): string {
    return accountNumber.slice(-4);
  }
}
