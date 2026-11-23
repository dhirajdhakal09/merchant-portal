import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  ApplicationDraftPayload,
  ApplicationQuery,
  AssignPayload,
  DecisionPayload,
  MerchantApplication,
  PaginatedResponse,
  RevealResponse,
  SensitiveField,
} from '../models/application.model';
import type { UserSummary } from '../models/user.model';

const BASE_URL = '/api/applications';
const USERS_URL = '/api/users';

/**
 * Thin HTTP layer for merchant applications: builds requests, returns typed Observables.
 * No state and no error handling here. Callers decide how to show loading/errors, and
 * the auth interceptor adds the bearer token.
 */
@Service()
export class ApplicationApiService {
  private readonly http = inject(HttpClient);

  getApplications(query: ApplicationQuery): Observable<PaginatedResponse<MerchantApplication>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);

    // Optional filters are only sent when they have a value, so the URL stays clean
    // and the server never receives e.g. "status=" or "search=%20".
    if (query.status) {
      params = params.set('status', query.status);
    }
    const search = query.search?.trim();
    if (search) {
      params = params.set('search', search);
    }

    return this.http.get<PaginatedResponse<MerchantApplication>>(BASE_URL, { params });
  }

  /** Any viewable application. Sensitive fields come back MASKED. */
  getApplication(id: string): Observable<MerchantApplication> {
    return this.http.get<MerchantApplication>(itemUrl(id));
  }

  /**
   * The creator's own DRAFT with full values, for editing in the wizard.
   * Errors: 403 not the creator, 409 no longer a draft.
   */
  getDraft(id: string): Observable<MerchantApplication> {
    return this.http.get<MerchantApplication>(`${itemUrl(id)}/draft`);
  }

  /** Creates a new DRAFT. Any field may be missing or empty. Server responds 201. */
  createDraft(data: ApplicationDraftPayload): Observable<MerchantApplication> {
    return this.http.post<MerchantApplication>(BASE_URL, data);
  }

  /**
   * Saves partial draft data (used by auto-save). Fields not sent keep their saved values.
   * Errors: 403 not the creator, 409 no longer a draft.
   */
  saveDraft(id: string, data: ApplicationDraftPayload): Observable<MerchantApplication> {
    return this.http.put<MerchantApplication>(`${itemUrl(id)}/draft`, data);
  }

  /**
   * Submits the saved draft for review. The server validates the stored data, so save the
   * latest changes first. Errors: 422 with field errors (ValidationErrorResponse), 409 not a draft.
   */
  submitApplication(id: string): Observable<MerchantApplication> {
    // No body: the server submits what it has stored, not what the client sends.
    return this.http.post<MerchantApplication>(`${itemUrl(id)}/submit`, null);
  }

  /* --------------------------------- review --------------------------------- */

  /**
   * Full value of ONE sensitive field. ADMIN or the assigned REVIEWER only; the server
   * records every reveal in its audit log. Errors: 403 not allowed, 422 unknown field.
   */
  revealField(id: string, field: SensitiveField): Observable<RevealResponse> {
    return this.http.post<RevealResponse>(`${itemUrl(id)}/reveal`, { field });
  }

  /** Assigned REVIEWER: SUBMITTED → IN_REVIEW. Errors: 403 not assigned, 409 wrong status. */
  startReview(id: string): Observable<MerchantApplication> {
    // No body: the action and the reviewer (from the token) are all the server needs.
    return this.http.post<MerchantApplication>(`${itemUrl(id)}/start-review`, null);
  }

  /**
   * Assigned REVIEWER records APPROVED/REJECTED on an IN_REVIEW application.
   * Errors: 422 with field errors (decision, riskLevel, notes), 409 wrong status.
   */
  submitDecision(id: string, decision: DecisionPayload): Observable<MerchantApplication> {
    return this.http.post<MerchantApplication>(`${itemUrl(id)}/decision`, decision);
  }

  /** ADMIN assigns or reassigns a reviewer. Errors: 409 wrong status, 422 not a reviewer. */
  assignReviewer(id: string, reviewerId: string): Observable<MerchantApplication> {
    const body: AssignPayload = { reviewerId };
    return this.http.put<MerchantApplication>(`${itemUrl(id)}/assign`, body);
  }

  /** ADMIN: reviewers (id + name) for the assignment dropdown. */
  getReviewers(): Observable<UserSummary[]> {
    const params = new HttpParams().set('role', 'REVIEWER');
    return this.http.get<UserSummary[]>(USERS_URL, { params });
  }
}

/** URL for one application. The id is encoded so a value like "../x" or "a?b" can't change the path. */
function itemUrl(id: string): string {
  return `${BASE_URL}/${encodeURIComponent(id)}`;
}
