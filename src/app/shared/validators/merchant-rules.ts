import type {
  BankDetails,
  BusinessInfo,
  FieldError,
  OwnerInfo,
} from '../../core/models/application.model';

/*
 * Validation rules for a merchant application, as plain functions with no Angular code.
 *
 * The shared constants and checks below are the single source of truth, used by:
 * - the mock server's submit endpoint, through the message-returning rules further down
 *   (the real enforcement)
 * - the wizard's Angular validators in merchant.validators.ts (instant feedback)
 * so the client and server rules can't drift apart.
 */

export type Rule = (value: string | undefined) => string | null;

/* ------------------------- shared constants & checks ---------------------- */

export const BUSINESS_TYPES = ['Private Limited', 'Partnership', 'Sole Proprietorship'] as const;

/**
 * name@domain.tld. Domain segments exclude dots, so there's only one way to split the
 * input; this keeps matching linear (no catastrophic backtracking / ReDoS).
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
/** Digits, spaces and dashes, optional leading +, 7–20 characters. */
export const PHONE_PATTERN = /^\+?\d[\d\s-]{6,19}$/;
/** 5–20 letters, digits or dashes, any case (e.g. DEMO-REG-100137). */
export const REGISTRATION_PATTERN = /^[A-Z0-9-]{5,20}$/i;
export const ACCOUNT_NUMBER_LENGTH = { min: 6, max: 20 } as const;
export const ROUTING_NUMBER_LENGTH = { min: 9, max: 9 } as const;
export const MIN_OWNER_AGE = 18;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIGITS = /^\d+$/;

export const isBlank = (v: string | null | undefined): boolean => !v || v.trim() === '';

export const isDigits = (v: string): boolean => DIGITS.test(v);

/** A real calendar date in YYYY-MM-DD form. Rejects impossible dates like 2001-02-30. */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // Round-trip check: an impossible date rolls over (Feb 30 → Mar 2) and no longer matches.
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * True if someone born on `isoDate` is at least `years` old on `today`.
 * Birthday today counts. Uses UTC so the browser and server give the same answer.
 * Someone born on 29 Feb reaches the age on 1 Mar in non-leap years.
 */
export function isAtLeastAge(isoDate: string, years: number, today: Date = new Date()): boolean {
  const birth = Date.parse(`${isoDate}T00:00:00Z`);
  const cutoff = Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate());
  return birth <= cutoff;
}

/** A parseable absolute URL using http or https. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

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

export const digitsBetween =
  (label: string, { min, max }: { min: number; max: number }): Rule =>
  (v) => {
    if (isBlank(v)) return null;
    const value = v!.trim();
    const ok = isDigits(value) && value.length >= min && value.length <= max;
    if (ok) return null;
    return min === max
      ? `${label} must be exactly ${min} digits.`
      : `${label} must be ${min}–${max} digits.`;
  };

export const optionalUrl: Rule = (v) =>
  isBlank(v) || isHttpUrl(v!.trim()) ? null : 'Enter a valid http:// or https:// website address.';

/** Valid YYYY-MM-DD date and owner at least MIN_OWNER_AGE years old. */
export const adultDateOfBirth: Rule = (v) => {
  if (isBlank(v)) return null; // `required` reports missing values
  const value = v!.trim();
  if (!isValidIsoDate(value)) return 'Enter a valid date of birth.';
  return isAtLeastAge(value, MIN_OWNER_AGE)
    ? null
    : `Owner must be at least ${MIN_OWNER_AGE} years old.`;
};

/* ----------------------------- rules per field ---------------------------- */

export const BUSINESS_RULES: Record<keyof BusinessInfo, Rule[]> = {
  legalName: [required('Legal name'), lengthBetween('Legal name', 2, 120)],
  tradingName: [required('Trading name'), lengthBetween('Trading name', 2, 120)],
  businessType: [required('Business type'), oneOf(BUSINESS_TYPES, 'Choose a valid business type.')],
  registrationNumber: [
    required('Registration number'),
    matches(REGISTRATION_PATTERN, 'Use 5–20 letters, digits or dashes.'),
  ],
  website: [optionalUrl],
};

export const OWNER_RULES: Record<keyof OwnerInfo, Rule[]> = {
  fullName: [required('Full name'), lengthBetween('Full name', 2, 100)],
  email: [required('Email'), matches(EMAIL_PATTERN, 'Enter a valid email address.')],
  phone: [required('Phone'), matches(PHONE_PATTERN, 'Enter a valid phone number.')],
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
    digitsBetween('Account number', ACCOUNT_NUMBER_LENGTH),
  ],
  routingNumber: [
    required('Routing number'),
    digitsBetween('Routing number', ROUTING_NUMBER_LENGTH),
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
