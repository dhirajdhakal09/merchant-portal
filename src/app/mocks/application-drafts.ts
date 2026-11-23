import type {
  BankDetails,
  BusinessInfo,
  MerchantApplication,
  OwnerInfo,
} from '../core/models/application.model';
import { db } from './data';

/*
 * Helpers for creating and saving drafts.
 *
 * Security: only the known form fields below are copied from the request body, and only
 * if they are strings. Anything else in the body (status, createdById, riskHistory, ...)
 * is ignored, so a client can't change protected fields by adding them to a draft save.
 * This is protection against "mass assignment".
 */

const MAX_FIELD_LENGTH = 500;

const BUSINESS_FIELDS = [
  'legalName',
  'tradingName',
  'businessType',
  'registrationNumber',
  'website',
] as const satisfies readonly (keyof BusinessInfo)[];
const OWNER_FIELDS = [
  'fullName',
  'email',
  'phone',
  'dateOfBirth',
] as const satisfies readonly (keyof OwnerInfo)[];
const BANK_FIELDS = [
  'accountHolderName',
  'bankName',
  'accountNumber',
  'routingNumber',
] as const satisfies readonly (keyof BankDetails)[];

/** Copies only the allowed keys whose values are strings, capped in length. */
function pickStrings<K extends string>(
  source: unknown,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  if (!source || typeof source !== 'object') return result;
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      result[key] = value.slice(0, MAX_FIELD_LENGTH);
    }
  }
  return result;
}

/** The empty form a brand-new draft starts from. */
export function emptyDetails(): Pick<MerchantApplication, 'business' | 'owner' | 'bank'> {
  return {
    business: { legalName: '', tradingName: '', businessType: '', registrationNumber: '' },
    owner: { fullName: '', email: '', phone: '', dateOfBirth: '' },
    bank: { accountHolderName: '', bankName: '', accountNumber: '', routingNumber: '' },
  };
}

/**
 * Merges the allowed fields from an untrusted request body into the given sections.
 * Fields not sent keep their current value, so partial saves don't wipe earlier input.
 */
export function mergeDraft(
  current: Pick<MerchantApplication, 'business' | 'owner' | 'bank'>,
  body: unknown,
): Pick<MerchantApplication, 'business' | 'owner' | 'bank'> {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const business: BusinessInfo = {
    ...current.business,
    ...pickStrings(payload['business'], BUSINESS_FIELDS),
  };
  if (!business.website?.trim()) {
    delete business.website; // optional field: store "not provided", not an empty string
  }

  return {
    business,
    owner: { ...current.owner, ...pickStrings(payload['owner'], OWNER_FIELDS) },
    bank: { ...current.bank, ...pickStrings(payload['bank'], BANK_FIELDS) },
  };
}

/** Next sequential id, e.g. app-046. */
export function nextApplicationId(): string {
  const max = db.applications.reduce((highest, app) => {
    const n = Number(app.id.replace('app-', ''));
    return Number.isFinite(n) ? Math.max(highest, n) : highest;
  }, 0);
  return `app-${String(max + 1).padStart(3, '0')}`;
}
