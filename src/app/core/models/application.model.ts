/** Lifecycle of a merchant application, from draft to final decision. */
export type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

/** Wizard step: the merchant's business. */
export interface BusinessInfo {
  legalName: string;
  tradingName: string;
  businessType: string;
  registrationNumber: string;
  website?: string;
}

/** Wizard step: the business owner. Contains personal data (fake data only). */
export interface OwnerInfo {
  fullName: string;
  email: string;
  phone: string;
  /** ISO date string, e.g. "1990-05-21". */
  dateOfBirth: string;
}

/** Wizard step: payout bank account. Sensitive: masked in the UI by default. */
export interface BankDetails {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
}

/** One reviewer decision. An application keeps every decision as its risk history. */
export interface RiskDecision {
  id: string;
  decision: 'APPROVED' | 'REJECTED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  notes: string;
  reviewerId: string;
  reviewerName: string;
  /** ISO date-time string. */
  decidedAt: string;
}

/** A full merchant application as returned by the API. */
export interface MerchantApplication {
  id: string;
  status: ApplicationStatus;
  business: BusinessInfo;
  owner: OwnerInfo;
  bank: BankDetails;
  /** The SALES user who created it; used to scope what SALES users can see. */
  createdById: string;
  /** The REVIEWER it is assigned to, if any (set by ADMIN). */
  assignedReviewerId?: string;
  /** Display name of the assigned reviewer, sent by the server so the UI needn't look it up. */
  assignedReviewerName?: string;
  riskHistory: RiskDecision[];
  /** ISO date-time string. */
  createdAt: string;
  /** ISO date-time string. */
  updatedAt: string;
}

/** Generic envelope for server-side paginated lists. */
export interface PaginatedResponse<T> {
  items: T[];
  /** Total matching records across all pages (for the pager). */
  total: number;
  /** 1-based page number. */
  page: number;
  pageSize: number;
}

/** Dashboard list query, sent to the API as query-string parameters. */
export interface ApplicationQuery {
  page: number;
  pageSize: number;
  status?: ApplicationStatus;
  search?: string;
}
