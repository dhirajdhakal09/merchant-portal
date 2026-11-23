import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { User } from '../models/user.model';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor: where the token is sent', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { getAccessToken: () => 'fake.access', refreshAccessToken: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches the bearer token to requests to our own API', () => {
    http.get('/api/applications').subscribe();

    const req = httpMock.expectOne('/api/applications');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake.access');
    req.flush({});
  });

  it('never sends the token to another origin', () => {
    http.get('https://third-party.example.com/data').subscribe();

    const req = httpMock.expectOne('https://third-party.example.com/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does not attach the token to the login and refresh endpoints', () => {
    http.post('/api/auth/login', {}).subscribe();
    http.post('/api/auth/refresh', {}).subscribe();

    for (const url of ['/api/auth/login', '/api/auth/refresh']) {
      const req = httpMock.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    }
  });
});

/**
 * Uses the REAL AuthService: the "only one refresh at a time" logic (refreshInFlight$ +
 * shareReplay) lives there, so a fake would not prove anything.
 */
describe('authInterceptor: refresh once on 401', () => {
  const user: User = { id: 'u-1', name: 'Test User', email: 'test@example.com', role: 'SALES' };
  const unauthorized = { status: 401, statusText: 'Unauthorized' };

  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    // Sign in so there is an access token (old) and a stored refresh token.
    auth.login(user.email, 'irrelevant').subscribe();
    httpMock
      .expectOne('/api/auth/login')
      .flush({ accessToken: 'fake.old', refreshToken: 'fake.refresh', user });
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('runs ONE refresh for several concurrent 401s and retries each with the new token', () => {
    const results: unknown[] = [];
    const urls = ['/api/a', '/api/b', '/api/c'];
    urls.forEach((url) => http.get(url).subscribe((body) => results.push(body)));

    // All three were sent with the expired token and all three get 401.
    for (const url of urls) {
      const req = httpMock.expectOne(url);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake.old');
      req.flush(null, unauthorized);
    }

    // Exactly one refresh call (expectOne fails if there are two or more).
    const refresh = httpMock.expectOne('/api/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'fake.refresh' });
    refresh.flush({ accessToken: 'fake.new', user });

    // Each original request is retried once, with the new token.
    for (const url of urls) {
      const retry = httpMock.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer fake.new');
      retry.flush({ url });
    }
    expect(results).toEqual(urls.map((url) => ({ url })));
  });

  it('does not loop: a retry that gets 401 again goes to the caller without a second refresh', () => {
    let error: HttpErrorResponse | undefined;
    http.get('/api/a').subscribe({ error: (e: HttpErrorResponse) => (error = e) });

    httpMock.expectOne('/api/a').flush(null, unauthorized);
    httpMock.expectOne('/api/auth/refresh').flush({ accessToken: 'fake.new', user });
    httpMock.expectOne('/api/a').flush(null, unauthorized); // the retry fails too

    httpMock.expectNone('/api/auth/refresh');
    expect(error?.status).toBe(401);
  });

  it('when the refresh fails, every waiting request errors and the user is logged out', () => {
    const errors: number[] = [];
    for (const url of ['/api/a', '/api/b']) {
      http.get(url).subscribe({ error: (e: HttpErrorResponse) => errors.push(e.status) });
    }
    httpMock.expectOne('/api/a').flush(null, unauthorized);
    httpMock.expectOne('/api/b').flush(null, unauthorized);

    httpMock.expectOne('/api/auth/refresh').flush(null, unauthorized);

    expect(errors).toEqual([401, 401]);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getAccessToken()).toBeNull();
    expect(sessionStorage.getItem('mp.refreshToken')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
