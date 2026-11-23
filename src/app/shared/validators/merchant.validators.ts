import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  isAtLeastAge,
  isBlank,
  isDigits,
  isHttpUrl,
  isValidIsoDate,
  REGISTRATION_PATTERN,
} from './merchant-rules';

/*
 * Reactive Forms validators for the merchant application wizard.
 *
 * Each one wraps a shared check from merchant-rules.ts, the same checks the mock server
 * runs on submit, so a form that passes here won't be rejected by the server.
 *
 * Convention: empty values are valid here. "Is it filled in?" is Validators.required's
 * job, so each field reports one clear problem at a time and optional fields can reuse
 * format validators.
 */

/**
 * Control-level: date of birth (YYYY-MM-DD) must be at least `years` ago.
 * Birthday today counts as old enough.
 * Errors: { invalidDate: true } or { minAge: { required: years } }
 */
export function minAge(years: number): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value;
    if (isBlank(value)) return null;
    if (!isValidIsoDate(value)) return { invalidDate: true };
    return isAtLeastAge(value, years) ? null : { minAge: { required: years } };
  };
}

/**
 * Control-level: digits only, with a length between `min` and `max` (inclusive).
 * Errors: { digitsOnly: true } if anything but 0–9 is present,
 *         { digitsLength: { min, max, actual } } if the length is out of range.
 */
export function digitsOnly(min: number, max: number): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value;
    if (isBlank(value)) return null;
    if (!isDigits(value)) return { digitsOnly: true };
    return value.length < min || value.length > max
      ? { digitsLength: { min, max, actual: value.length } }
      : null;
  };
}

/**
 * Control-level: business registration number format, 5–20 letters, digits or dashes
 * (same pattern as the server).
 * Error: { registrationNumber: true }
 */
export function registrationNumber(): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value;
    if (isBlank(value)) return null;
    return REGISTRATION_PATTERN.test(value) ? null : { registrationNumber: true };
  };
}

/**
 * Control-level: optional website. Empty is valid; otherwise must be an http(s) URL.
 * Error: { url: true }
 */
export function optionalUrl(): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value;
    if (isBlank(value)) return null;
    return isHttpUrl(value.trim()) ? null : { url: true };
  };
}

/**
 * Control-level: shows an error the SERVER reported (e.g. from a 422) for as long as the
 * field still holds the value the server rejected. Editing the field clears it.
 *
 * Why a validator instead of control.setErrors(): setErrors() is wiped the next time the
 * validators run, and they re-run whenever a form directive (re)attaches to the control,
 * e.g. when a wizard step is shown again. A validator survives that.
 * Error: { server: message }
 */
export function serverError(message: string, rejectedValue: unknown): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    control.value === rejectedValue ? { server: message } : null;
}

/**
 * GROUP-level: two controls in the same FormGroup must have the same value, e.g.
 * matchFields('accountNumber', 'confirmAccountNumber'). Attach it to the group, not a control.
 * Valid while either field is still empty (Validators.required covers that).
 * Error (on the group): { fieldsMismatch: true }
 */
export function matchFields(field: string, confirmField: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const value = group.get(field)?.value;
    const confirm = group.get(confirmField)?.value;
    if (isBlank(value) || isBlank(confirm)) return null;
    return value === confirm ? null : { fieldsMismatch: true };
  };
}
