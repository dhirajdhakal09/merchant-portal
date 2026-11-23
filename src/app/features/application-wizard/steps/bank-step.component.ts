import { Component, input } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { watchFormGroup } from '../../../shared/forms/watch-form-group';
import { errorMessage, shouldShowError } from '../../../shared/validators/error-messages';
import type { ApplicationForm } from '../application-form';

@Component({
  selector: 'app-bank-step',
  imports: [ReactiveFormsModule],
  templateUrl: './bank-step.component.html',
})
export class BankStepComponent {
  readonly group = input.required<ApplicationForm['controls']['bank']>();

  /** See BusinessStepComponent: keeps this OnPush view in sync with outside form changes. */
  private readonly formState = watchFormGroup(this.group);

  protected showError(control: AbstractControl): boolean {
    this.formState();
    return shouldShowError(control);
  }

  protected message(errors: ValidationErrors | null, label: string): string | null {
    this.formState();
    return errorMessage(errors, label);
  }

  /**
   * The mismatch error lives on the GROUP (matchFields is a group-level validator), so it's
   * shown under the confirm field once that field has been touched.
   */
  protected showMismatch(): boolean {
    this.formState();
    const group = this.group();
    return group.hasError('fieldsMismatch') && group.controls.confirmAccountNumber.touched;
  }
}
