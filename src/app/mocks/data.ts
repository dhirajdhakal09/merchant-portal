import type {
  ApplicationStatus,
  MerchantApplication,
  RiskDecision,
} from '../core/models/application.model';
import type { User } from '../core/models/user.model';

/**
 * A user as stored by the mock server. Includes the password, which must
 * never be sent to the client; use `toPublicUser` before returning one.
 */
export interface MockUser extends User {
  password: string;
}

/**
 * Shared demo password for every seeded account. This is intentionally public:
 * it only works against the in-browser mock API and protects nothing real.
 */
export const DEMO_PASSWORD = 'password123';

const users: MockUser[] = [
  {
    id: 'u-sales-1',
    name: 'Sam Sales',
    email: 'sales1@example.com',
    role: 'SALES',
    password: DEMO_PASSWORD,
  },
  {
    id: 'u-sales-2',
    name: 'Sandy Sales',
    email: 'sales2@example.com',
    role: 'SALES',
    password: DEMO_PASSWORD,
  },
  {
    id: 'u-reviewer-1',
    name: 'Riley Reviewer',
    email: 'reviewer1@example.com',
    role: 'REVIEWER',
    password: DEMO_PASSWORD,
  },
  {
    id: 'u-reviewer-2',
    name: 'Robin Reviewer',
    email: 'reviewer2@example.com',
    role: 'REVIEWER',
    password: DEMO_PASSWORD,
  },
  {
    id: 'u-admin-1',
    name: 'Alex Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    password: DEMO_PASSWORD,
  },
];

/* -------------------------------------------------------------------------- */
/* Fake merchant applications                                                 */
/* -------------------------------------------------------------------------- */
/*
 * Generated deterministically from the record index (no Math.random), so the same
 * 45 records appear on every reload, which keeps demos and tests repeatable.
 *
 * Everything is fictional and deliberately invalid as real data:
 * - emails and websites use the reserved example.com domain
 * - phone numbers use the 555-01xx range reserved for fiction
 * - account numbers start with 00000 and routing numbers with 000, which no real bank uses
 * - registration numbers are prefixed DEMO-REG
 * - owner names all use the surname "Example"
 */

const APPLICATION_COUNT = 45;
const STATUSES: ApplicationStatus[] = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED'];
const SALES_IDS = ['u-sales-1', 'u-sales-2'];
const REVIEWER_IDS = ['u-reviewer-1', 'u-reviewer-2'];

const PLACES = [
  'Himalayan',
  'Everest',
  'Annapurna',
  'Kathmandu Valley',
  'Pokhara Lakeside',
  'Lumbini',
  'Chitwan',
  'Mustang',
  'Langtang',
];
const TRADES = [
  { name: 'Coffee Traders', short: 'Coffee' },
  { name: 'Handicrafts', short: 'Crafts' },
  { name: 'Tea Estates', short: 'Tea' },
  { name: 'Trekking Gear', short: 'Treks' },
  { name: 'Pashmina House', short: 'Pashmina' },
  { name: 'Spice Merchants', short: 'Spices' },
  { name: 'Organic Foods', short: 'Organics' },
  { name: 'Bakery & Cafe', short: 'Bakery' },
  { name: 'Electronics Hub', short: 'Electronics' },
  { name: 'Book Corner', short: 'Books' },
];
const BUSINESS_TYPES = [
  { type: 'Private Limited', suffix: ' Pvt. Ltd.' },
  { type: 'Partnership', suffix: ' & Co.' },
  { type: 'Sole Proprietorship', suffix: '' },
];
const OWNER_FIRST_NAMES = ['Maya', 'Arjun', 'Sita', 'Bikash', 'Anita', 'Rohan', 'Priya', 'Kiran'];
const BANK_NAMES = ['Demo Bank of Nowhere', 'Example Savings Bank', 'Placeholder Commercial Bank'];
const APPROVE_NOTES = [
  'Documents verified. Low chargeback exposure for this category.',
  'Trading history and ownership checks complete.',
  'Moderate volume expected; standard monitoring applies.',
];
const REJECT_NOTES = [
  'Registration details could not be verified.',
  'High-risk category without sufficient trading history.',
  'Ownership information incomplete.',
];

const HOUR_MS = 60 * 60 * 1000;
/** Fixed reference point so generated dates never change. */
const BASE_TIME = Date.UTC(2026, 10, 20, 9, 0, 0); // 20 Nov 2026, 09:00 UTC

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const iso = (ms: number) => new Date(ms).toISOString();

function reviewerName(id: string): string {
  return users.find((u) => u.id === id)?.name ?? 'Unknown reviewer';
}

function decision(
  appId: string,
  seq: number,
  outcome: RiskDecision['decision'],
  reviewerId: string,
  decidedAtMs: number,
  i: number,
): RiskDecision {
  const approved = outcome === 'APPROVED';
  // Approvals are LOW/MEDIUM risk, rejections HIGH/MEDIUM, alternating by index.
  let riskLevel: RiskDecision['riskLevel'] = 'MEDIUM';
  if (i % 2 === 0) {
    riskLevel = approved ? 'LOW' : 'HIGH';
  }
  return {
    id: `${appId}-rd-${seq}`,
    decision: outcome,
    riskLevel,
    notes: (approved ? APPROVE_NOTES : REJECT_NOTES)[i % 3],
    reviewerId,
    reviewerName: reviewerName(reviewerId),
    decidedAt: iso(decidedAtMs),
  };
}

function buildApplication(i: number): MerchantApplication {
  const n = i + 1;
  const id = `app-${pad(n, 3)}`;
  const status = STATUSES[i % STATUSES.length];
  const place = PLACES[i % PLACES.length];
  const trade = TRADES[i % TRADES.length]; // 9 x 10 coprime, so every name is unique
  const businessType = BUSINESS_TYPES[i % BUSINESS_TYPES.length];
  const tradingName = `${place} ${trade.short}`;
  const firstName = OWNER_FIRST_NAMES[i % OWNER_FIRST_NAMES.length];

  const createdMs = BASE_TIME - n * 20 * HOUR_MS;
  // Update offset (1-72h) is larger than the 20h gap between records, so "most recently
  // updated" differs from "most recently created" and the updatedAt sort is visible.
  const updatedMs = createdMs + (((i * 29) % 72) + 1) * HOUR_MS;

  // Drafts aren't assigned yet. floor(i/2) avoids always pairing the same SALES and REVIEWER.
  const assignedReviewerId =
    status === 'DRAFT' ? undefined : REVIEWER_IDS[Math.floor(i / 2) % REVIEWER_IDS.length];

  const riskHistory: RiskDecision[] = [];
  if (assignedReviewerId && status === 'APPROVED') {
    if (i % 3 === 0) {
      // Rejected once, then fixed and approved: shows a multi-entry history.
      const midMs = createdMs + (updatedMs - createdMs) / 2;
      riskHistory.push(decision(id, 1, 'REJECTED', assignedReviewerId, midMs, i));
    }
    riskHistory.push(
      decision(id, riskHistory.length + 1, 'APPROVED', assignedReviewerId, updatedMs, i),
    );
  } else if (assignedReviewerId && status === 'REJECTED') {
    riskHistory.push(decision(id, 1, 'REJECTED', assignedReviewerId, updatedMs, i));
  }

  return {
    id,
    status,
    business: {
      legalName: `${place} ${trade.name}${businessType.suffix}`,
      tradingName,
      businessType: businessType.type,
      registrationNumber: `DEMO-REG-${pad(100000 + n * 137, 6)}`,
      website: i % 3 === 2 ? undefined : `https://${slug(tradingName)}.example.com`,
    },
    owner: {
      fullName: `${firstName} Example`,
      email: `owner${pad(n, 2)}@example.com`,
      phone: `+1-555-01${pad(n, 2)}`,
      dateOfBirth: `${1965 + ((i * 7) % 35)}-${pad((i % 12) + 1, 2)}-${pad(((i * 3) % 28) + 1, 2)}`,
    },
    bank: {
      accountHolderName: `${place} ${trade.name}${businessType.suffix}`,
      bankName: BANK_NAMES[i % BANK_NAMES.length],
      accountNumber: `00000${pad(10000 + n * 373, 5)}`,
      routingNumber: `000${pad(100000 + n * 211, 6)}`,
    },
    createdById: SALES_IDS[i % SALES_IDS.length],
    assignedReviewerId,
    assignedReviewerName: assignedReviewerId ? reviewerName(assignedReviewerId) : undefined,
    riskHistory,
    createdAt: iso(createdMs),
    updatedAt: iso(updatedMs),
  };
}

/**
 * In-memory "database". Lives only in the browser tab and resets on page reload.
 */
export const db: { users: MockUser[]; applications: MerchantApplication[] } = {
  users,
  applications: Array.from({ length: APPLICATION_COUNT }, (_, i) => buildApplication(i)),
};

/** Strips server-only fields (the password) before a user leaves the "server". */
export function toPublicUser({ id, name, email, role }: MockUser): User {
  return { id, name, email, role };
}
