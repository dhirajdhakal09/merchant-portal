import type {
  BankDetails,
  BusinessInfo,
  FieldError,
  OwnerInfo,
} from '../../core/models/application.model';

/*
 * Validation rules for a merchant application, as plain functions with no Angular code.
 *
 * Written once and used in two places:
 * - the mock server's submit endpoint (the real enforcement)
 * - the wizard's Reactive Forms validators (instant feedback; to be built), which will
 *   wrap these same functions so the client and server rules can't drift apart.
 *
 * Each rule returns an error message, or null when the value is valid.
 */

export type Rule = (value: string | undefined) => string | null;

export const BUSINESS_TYPES = ['Private Limited', 'Partnership', 'Sole Proprietorship'] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9\s-]{6,19}$/; // digits, spaces, dashes; optional leading +
const REGISTRATION = /^[A-Z0-9-]{5,20}$/i;
const ACCOUNT_NUMBER = /^\d{6,20}$/;
const ROUTING_NUMBER = /^\d{9}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_OWNER_AGE = 18;

const isBlank = (v: string | undefined) => !v || v.trim() === '';

/* ----------------------------- building blocks ---------------------------- */

export const required =
  (label: string): Rule =>
  (v) =>
    isBlank(v) ? `${label} is required.` : null;

export const lengthBetween =
  (label: string, min: number, max: number): Rule =>
  (v) => {
    const len = v?.trim().length ?? 0;
    return len < min || len > max ? `${label} must be ${min}–${max} characters.` : null;
  };

export const matches =
  (pattern: RegExp, message: string): Rule =>
  (v) =>
    v && !pattern.test(v.trim()) ? message : null;

export const oneOf =
  (allowed: readonly string[], message: string): Rule =>
  (v) =>
    v && !allowed.includes(v) ? message : null;

export const optionalUrl: Rule = (v) => {
  if (isBlank(v)) return null;
  try {
    const url = new URL(v!.trim());
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : 'Website must start with http:// or https://.';
  } catch {
    return 'Enter a valid website address.';
  }
};

/** Valid YYYY-MM-DD date, not in the future, owner at least 18 years old. */
export const adultDateOfBirth: Rule = (v) => {
  if (isBlank(v)) return null; // `required` reports missing values
  const value = v!.trim();
  const date = new Date(`${value}T00:00:00Z`);
  // Round-trip check rejects impossible dates like 2001-02-30.
  if (
    !ISO_DATE.test(value) ||
    Number.isNaN(date.getTime()) ||
    !date.toISOString().startsWith(value)
  ) {
    return 'Enter a valid date of birth.';
  }
  const now = new Date();
  const eighteenYearsAgo = Date.UTC(
    now.getUTCFullYear() - MIN_OWNER_AGE,
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return date.getTime() > eighteenYearsAgo ? 'Owner must be at least 18 years old.' : null;
};

/* ----------------------------- rules per field ---------------------------- */

export const BUSINESS_RULES: Record<keyof BusinessInfo, Rule[]> = {
  legalName: [required('Legal name'), lengthBetween('Legal name', 2, 120)],
  tradingName: [required('Trading name'), lengthBetween('Trading name', 2, 120)],
  businessType: [required('Business type'), oneOf(BUSINESS_TYPES, 'Choose a valid business type.')],
  registrationNumber: [
    required('Registration number'),
    matches(REGISTRATION, 'Use 5–20 letters, digits or dashes.'),
  ],
  website: [optionalUrl],
};

export const OWNER_RULES: Record<keyof OwnerInfo, Rule[]> = {
  fullName: [required('Full name'), lengthBetween('Full name', 2, 100)],
  email: [required('Email'), matches(EMAIL, 'Enter a valid email address.')],
  phone: [required('Phone'), matches(PHONE, 'Enter a valid phone number.')],
  dateOfBirth: [required('Date of birth'), adultDateOfBirth],
};

export const BANK_RULES: Record<keyof BankDetails, Rule[]> = {
  accountHolderName: [
    required('Account holder name'),
    lengthBetween('Account holder name', 2, 120),
  ],
  bankName: [required('Bank name'), lengthBetween('Bank name', 2, 120)],
  accountNumber: [
    required('Account number'),
    matches(ACCOUNT_NUMBER, 'Account number must be 6–20 digits.'),
  ],
  routingNumber: [
    required('Routing number'),
    matches(ROUTING_NUMBER, 'Routing number must be exactly 9 digits.'),
  ],
};

/** First failing rule's message for a value, or null. */
export function firstError(rules: Rule[], value: string | undefined): string | null {
  for (const rule of rules) {
    const error = rule(value);
    if (error) return error;
  }
  return null;
}

/** Validates a whole application. Returns one error per invalid field (empty array = valid). */
export function validateApplication(app: {
  business: Partial<BusinessInfo>;
  owner: Partial<OwnerInfo>;
  bank: Partial<BankDetails>;
}): FieldError[] {
  const sections = [
    ['business', BUSINESS_RULES, app.business],
    ['owner', OWNER_RULES, app.owner],
    ['bank', BANK_RULES, app.bank],
  ] as const;

  const errors: FieldError[] = [];
  for (const [section, rules, values] of sections) {
    for (const [field, fieldRules] of Object.entries(rules) as [string, Rule[]][]) {
      const message = firstError(fieldRules, (values as Record<string, string | undefined>)[field]);
      if (message) errors.push({ field: `${section}.${field}`, message });
    }
  }
  return errors;
}
