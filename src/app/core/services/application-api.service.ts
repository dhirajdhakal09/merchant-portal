import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  ApplicationDraftPayload,
  ApplicationQuery,
  MerchantApplication,
  PaginatedResponse,
} from '../models/application.model';

const BASE_URL = '/api/applications';

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
}

/** URL for one application. The id is encoded so a value like "../x" or "a?b" can't change the path. */
function itemUrl(id: string): string {
  return `${BASE_URL}/${encodeURIComponent(id)}`;
}
