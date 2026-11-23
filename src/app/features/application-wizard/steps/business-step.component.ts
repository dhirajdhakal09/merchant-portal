import { Component, input } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { watchFormGroup } from '../../../shared/forms/watch-form-group';
import { errorMessage, shouldShowError } from '../../../shared/validators/error-messages';
import { BUSINESS_TYPES } from '../../../shared/validators/merchant-rules';
import type { ApplicationForm } from '../application-form';

@Component({
  selector: 'app-business-step',
  imports: [ReactiveFormsModule],
  templateUrl: './business-step.component.html',
})
export class BusinessStepComponent {
  readonly group = input.required<ApplicationForm['controls']['business']>();

  protected readonly businessTypes = BUSINESS_TYPES;

  /** Changes on every form event, so this OnPush view re-renders when the wizard
   *  marks fields touched or applies server errors. */
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
