import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import type {
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

  getApplication(id: string): Observable<MerchantApplication> {
    // Encode the id so a value like "../x" or "a?b" can't change the request path.
    return this.http.get<MerchantApplication>(`${BASE_URL}/${encodeURIComponent(id)}`);
  }
}
