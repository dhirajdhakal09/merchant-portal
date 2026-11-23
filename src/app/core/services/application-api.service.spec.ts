import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { MerchantApplication, PaginatedResponse } from '../models/application.model';
import { ApplicationApiService } from './application-api.service';

describe('ApplicationApiService', () => {
  let service: ApplicationApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApplicationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify()); // no unexpected or unanswered requests

  describe('getApplications', () => {
    it('sends GET /api/applications with page and pageSize only when no filters are set', () => {
      service.getApplications({ page: 2, pageSize: 10 }).subscribe();

      const req = httpMock.expectOne((r) => r.url === '/api/applications');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('10');
      expect(req.request.params.has('status')).toBe(false);
      expect(req.request.params.has('search')).toBe(false);
      expect(req.request.urlWithParams).toBe('/api/applications?page=2&pageSize=10');
      req.flush({ items: [], total: 0, page: 2, pageSize: 10 });
    });

    it('includes status and search when they have a value', () => {
      service
        .getApplications({ page: 1, pageSize: 25, status: 'IN_REVIEW', search: 'coffee' })
        .subscribe();

      const req = httpMock.expectOne((r) => r.url === '/api/applications');
      expect(req.request.params.get('status')).toBe('IN_REVIEW');
      expect(req.request.params.get('search')).toBe('coffee');
      expect(req.request.urlWithParams).toBe(
        '/api/applications?page=1&pageSize=25&status=IN_REVIEW&search=coffee',
      );
      req.flush({ items: [], total: 0, page: 1, pageSize: 25 });
    });

    it('omits an empty or whitespace-only search, and trims a real one', () => {
      service.getApplications({ page: 1, pageSize: 10, search: '' }).subscribe();
      service.getApplications({ page: 1, pageSize: 10, search: '   ' }).subscribe();
      service.getApplications({ page: 1, pageSize: 10, search: '  tea  ' }).subscribe();

      const [empty, blank, padded] = httpMock.match((r) => r.url === '/api/applications');
      expect(empty.request.params.has('search')).toBe(false);
      expect(blank.request.params.has('search')).toBe(false);
      expect(padded.request.params.get('search')).toBe('tea');
      [empty, blank, padded].forEach((r) =>
        r.flush({ items: [], total: 0, page: 1, pageSize: 10 }),
      );
    });

    it('emits the server response unchanged', () => {
      const page: PaginatedResponse<MerchantApplication> = {
        items: [{ id: 'app-001' } as MerchantApplication],
        total: 1,
        page: 1,
        pageSize: 10,
      };
      let received: unknown;
      service.getApplications({ page: 1, pageSize: 10 }).subscribe((res) => (received = res));

      httpMock.expectOne((r) => r.url === '/api/applications').flush(page);

      expect(received).toEqual(page);
    });
  });

  describe('getApplication', () => {
    it('sends GET /api/applications/:id and emits the application', () => {
      const app = { id: 'app-007' } as MerchantApplication;
      let received: unknown;
      service.getApplication('app-007').subscribe((res) => (received = res));

      const req = httpMock.expectOne('/api/applications/app-007');
      expect(req.request.method).toBe('GET');
      req.flush(app);

      expect(received).toEqual(app);
    });

    it('URL-encodes the id so it cannot change the request path', () => {
      service.getApplication('../users?x=1').subscribe();

      const req = httpMock.expectOne('/api/applications/..%2Fusers%3Fx%3D1');
      req.flush({});
    });
  });
});
