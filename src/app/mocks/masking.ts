import type { MerchantApplication, SensitiveField } from '../core/models/application.model';

/*
 * Server-side masking of sensitive fields.
 *
 * Responses that list or show applications to anyone go through maskApplication(), so the
 * full values never leave the "server" there. The only ways to get a full value are:
 * - POST /api/applications/:id/reveal (ADMIN or the assigned REVIEWER), which is audited
 * - the creator's own DRAFT (GET …/draft, create/save responses): it's their unsubmitted input
 */

export const SENSITIVE_FIELDS: readonly SensitiveField[] = [
  'bank.accountNumber',
  'bank.routingNumber',
  'owner.dateOfBirth',
];

export function isSensitiveField(value: unknown): value is SensitiveField {
  return SENSITIVE_FIELDS.includes(value as SensitiveField);
}

/** "0000012345" → "••••2345". Short values are fully masked; empty stays empty. */
export function maskNumber(value: string): string {
  if (!value) return '';
  return value.length > 4 ? `••••${value.slice(-4)}` : '••••';
}

/** "1990-05-21" → "••/••/1990" (year only). Empty stays empty. */
export function maskDateOfBirth(value: string): string {
  if (!value) return '';
  const year = value.slice(0, 4);
  return /^\d{4}$/.test(year) ? `••/••/${year}` : '••/••/••••';
}

/** A COPY of the application with every sensitive field masked. Never mutates the stored record. */
export function maskApplication(app: MerchantApplication): MerchantApplication {
  return {
    ...app,
    owner: { ...app.owner, dateOfBirth: maskDateOfBirth(app.owner.dateOfBirth) },
    bank: {
      ...app.bank,
      accountNumber: maskNumber(app.bank.accountNumber),
      routingNumber: maskNumber(app.bank.routingNumber),
    },
    riskHistory: app.riskHistory.map((decision) => ({ ...decision })),
  };
}

/** The full value of one sensitive field (for reveal). */
export function readSensitiveField(app: MerchantApplication, field: SensitiveField): string {
  switch (field) {
    case 'bank.accountNumber':
      return app.bank.accountNumber;
    case 'bank.routingNumber':
      return app.bank.routingNumber;
    case 'owner.dateOfBirth':
      return app.owner.dateOfBirth;
  }
}
