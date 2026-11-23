import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type {
  ApplicationDraftPayload,
  MerchantApplication,
  PaginatedResponse,
  ValidationErrorResponse,
} from '../models/application.model';
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

  describe('getDraft', () => {
    it('sends GET /api/applications/:id/draft and emits the draft', () => {
      const draft = { id: 'app-046', status: 'DRAFT' } as MerchantApplication;
      let received: unknown;
      service.getDraft('app-046').subscribe((res) => (received = res));

      const req = httpMock.expectOne('/api/applications/app-046/draft');
      expect(req.request.method).toBe('GET');
      req.flush(draft);

      expect(received).toEqual(draft);
    });

    it('URL-encodes the id', () => {
      service.getDraft('a/b').subscribe();

      httpMock.expectOne('/api/applications/a%2Fb/draft').flush({});
    });
  });

  describe('createDraft', () => {
    it('POSTs the partial data to /api/applications and emits the created draft', () => {
      const data: ApplicationDraftPayload = { business: { legalName: 'Test Momo House' } };
      const created = { id: 'app-046', status: 'DRAFT' } as MerchantApplication;
      let received: unknown;
      service.createDraft(data).subscribe((res) => (received = res));

      const req = httpMock.expectOne('/api/applications');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(data);
      req.flush(created, { status: 201, statusText: 'Created' });

      expect(received).toEqual(created);
    });

    it('accepts an empty payload', () => {
      service.createDraft({}).subscribe();

      const req = httpMock.expectOne('/api/applications');
      expect(req.request.body).toEqual({});
      req.flush({}, { status: 201, statusText: 'Created' });
    });
  });

  describe('saveDraft', () => {
    it('PUTs the partial data to /api/applications/:id/draft and emits the saved application', () => {
      const data: ApplicationDraftPayload = { owner: { email: 'tara@example.com' } };
      const saved = { id: 'app-046', status: 'DRAFT' } as MerchantApplication;
      let received: unknown;
      service.saveDraft('app-046', data).subscribe((res) => (received = res));

      const req = httpMock.expectOne('/api/applications/app-046/draft');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(data);
      req.flush(saved);

      expect(received).toEqual(saved);
    });

    it('URL-encodes the id', () => {
      service.saveDraft('a/b', {}).subscribe();

      httpMock.expectOne('/api/applications/a%2Fb/draft').flush({});
    });

    it('passes server errors (e.g. 409) to the caller unchanged', () => {
      let error: HttpErrorResponse | undefined;
      service.saveDraft('app-002', {}).subscribe({ error: (e) => (error = e) });

      httpMock
        .expectOne('/api/applications/app-002/draft')
        .flush(
          { message: 'Application is SUBMITTED and can no longer be edited' },
          { status: 409, statusText: 'Conflict' },
        );

      expect(error?.status).toBe(409);
    });
  });

  describe('submitApplication', () => {
    it('POSTs to /api/applications/:id/submit with no body and emits the submitted application', () => {
      const submitted = { id: 'app-046', status: 'SUBMITTED' } as MerchantApplication;
      let received: unknown;
      service.submitApplication('app-046').subscribe((res) => (received = res));

      const req = httpMock.expectOne('/api/applications/app-046/submit');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush(submitted);

      expect(received).toEqual(submitted);
    });

    it('URL-encodes the id', () => {
      service.submitApplication('a?b').subscribe();

      httpMock.expectOne('/api/applications/a%3Fb/submit').flush({});
    });

    it('passes a 422 with its field errors to the caller', () => {
      const body: ValidationErrorResponse = {
        message: 'Some fields are missing or invalid',
        errors: [{ field: 'owner.email', message: 'Email is required.' }],
      };
      let error: HttpErrorResponse | undefined;
      service.submitApplication('app-046').subscribe({ error: (e) => (error = e) });

      httpMock
        .expectOne('/api/applications/app-046/submit')
        .flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect(error?.error).toEqual(body); // the field list is available to the wizard
    });
  });
});
