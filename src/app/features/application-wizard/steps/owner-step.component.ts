import { Component, input } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { watchFormGroup } from '../../../shared/forms/watch-form-group';
import { errorMessage, shouldShowError } from '../../../shared/validators/error-messages';
import type { ApplicationForm } from '../application-form';

@Component({
  selector: 'app-owner-step',
  imports: [ReactiveFormsModule],
  templateUrl: './owner-step.component.html',
})
export class OwnerStepComponent {
  readonly group = input.required<ApplicationForm['controls']['owner']>();

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
}
