import type { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Show a field's error only once the user has left the field (touched), or after they
 * tried to continue/submit (which marks every field as touched).
 */
export function shouldShowError(control: AbstractControl): boolean {
  return control.invalid && control.touched;
}

/**
 * Turns a control's error object into ONE user-facing message (or null).
 *
 * Order: a server error (from a 422) wins, then "required", then format errors.
 * `overrides` lets a field reword generic keys, e.g. { pattern: 'Enter a valid phone number.' }.
 */
export function errorMessage(
  errors: ValidationErrors | null,
  label: string,
  overrides: Record<string, string> = {},
): string | null {
  if (!errors) return null;

  if (typeof errors['server'] === 'string') return errors['server'];
  if (errors['required']) return `${label} is required.`;

  for (const key of Object.keys(errors)) {
    if (overrides[key]) return overrides[key];
    const detail = errors[key];
    switch (key) {
      case 'minlength':
        return `${label} must be at least ${detail.requiredLength} characters.`;
      case 'maxlength':
        return `${label} must be at most ${detail.requiredLength} characters.`;
      case 'email':
      case 'pattern':
        return `Enter a valid ${label.toLowerCase()}.`;
      case 'minAge':
        return `Must be at least ${detail.required} years old.`;
      case 'invalidDate':
        return 'Enter a valid date.';
      case 'digitsOnly':
        return `${label} must contain digits only.`;
      case 'digitsLength':
        return detail.min === detail.max
          ? `${label} must be exactly ${detail.min} digits.`
          : `${label} must be ${detail.min}–${detail.max} digits.`;
      case 'registrationNumber':
        return 'Use 5–20 letters, digits or dashes.';
      case 'url':
        return 'Enter a valid http:// or https:// address.';
    }
  }
  return `${label} is invalid.`;
}
