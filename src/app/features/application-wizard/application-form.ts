import { inject } from '@angular/core';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import type {
  ApplicationDraftPayload,
  MerchantApplication,
} from '../../core/models/application.model';
import {
  ACCOUNT_NUMBER_LENGTH,
  EMAIL_PATTERN,
  MIN_OWNER_AGE,
  PHONE_PATTERN,
  ROUTING_NUMBER_LENGTH,
} from '../../shared/validators/merchant-rules';
import {
  digitsOnly,
  matchFields,
  minAge,
  optionalUrl,
  registrationNumber,
} from '../../shared/validators/merchant.validators';

/** Length limits for free-text fields, matching the server's rules. */
const NAME = [Validators.minLength(2), Validators.maxLength(120)];

/**
 * Builds the typed form for the merchant application wizard: one nested group per wizard
 * step, mirroring MerchantApplication (business / owner / bank), plus confirmAccountNumber,
 * which exists only in the form to catch typos.
 *
 * Must be called in an injection context (e.g. a component field initializer), because it
 * uses inject(). NonNullableFormBuilder makes every value a `string` (never null), and
 * reset() returns controls to '' instead of null.
 */
export function buildApplicationForm() {
  const fb = inject(NonNullableFormBuilder);

  return fb.group({
    business: fb.group({
      legalName: ['', [Validators.required, ...NAME]],
      tradingName: ['', [Validators.required, ...NAME]],
      businessType: ['', Validators.required], // a <select> limited to BUSINESS_TYPES
      registrationNumber: ['', [Validators.required, registrationNumber()]],
      website: ['', optionalUrl()],
    }),
    owner: fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      // Validators.email alone accepts "a@b"; the shared pattern also requires a domain dot,
      // matching the server.
      email: ['', [Validators.required, Validators.email, Validators.pattern(EMAIL_PATTERN)]],
      phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      dateOfBirth: ['', [Validators.required, minAge(MIN_OWNER_AGE)]],
    }),
    bank: fb.group(
      {
        accountHolderName: ['', [Validators.required, ...NAME]],
        bankName: ['', [Validators.required, ...NAME]],
        accountNumber: [
          '',
          [Validators.required, digitsOnly(ACCOUNT_NUMBER_LENGTH.min, ACCOUNT_NUMBER_LENGTH.max)],
        ],
        confirmAccountNumber: ['', Validators.required],
        routingNumber: [
          '',
          [Validators.required, digitsOnly(ROUTING_NUMBER_LENGTH.min, ROUTING_NUMBER_LENGTH.max)],
        ],
      },
      // Group-level: compares two sibling controls, so it must live on their parent group.
      { validators: matchFields('accountNumber', 'confirmAccountNumber') },
    ),
  });
}

/** The fully typed form, e.g. form.controls.bank.controls.accountNumber is FormControl<string>. */
export type ApplicationForm = ReturnType<typeof buildApplicationForm>;

/** The form's full value (every field a string), as returned by form.getRawValue(). */
export type ApplicationFormValue = ReturnType<ApplicationForm['getRawValue']>;

/**
 * Form value → API payload. Drops confirmAccountNumber, which exists only in the form
 * to catch typos and must never be sent.
 */
export function toDraftPayload(value: ApplicationFormValue): ApplicationDraftPayload {
  const { accountHolderName, bankName, accountNumber, routingNumber } = value.bank;
  return {
    business: value.business,
    owner: value.owner,
    bank: { accountHolderName, bankName, accountNumber, routingNumber },
  };
}

/**
 * Saved application → form value (used when editing an existing draft).
 * The confirmation is prefilled with the saved account number: it was already confirmed
 * when first entered, so the user isn't forced to retype it.
 */
export function toFormValue(app: MerchantApplication): ApplicationFormValue {
  return {
    business: { ...app.business, website: app.business.website ?? '' },
    owner: { ...app.owner },
    bank: { ...app.bank, confirmAccountNumber: app.bank.accountNumber },
  };
}
