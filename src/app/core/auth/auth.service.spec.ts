import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { AuthResponse } from '../models/user.model';
import { AuthService } from './auth.service';

const REFRESH_TOKEN_KEY = 'mp.refreshToken';

const authResponse: AuthResponse = {
  accessToken: 'fake.access',
  refreshToken: 'fake.refresh',
  user: { id: 'u-sales-1', name: 'Sam Sales', email: 'sales1@example.com', role: 'SALES' },
};

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify(); // fails the test if any unexpected request was made
    sessionStorage.clear();
  });

  function loginAsSales(): void {
    service.login('sales1@example.com', 'password123').subscribe();
    httpMock.expectOne('/api/auth/login').flush(authResponse);
  }

  describe('login', () => {
    it('starts logged out', () => {
      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(service.role()).toBeNull();
      expect(service.getAccessToken()).toBeNull();
    });

    it('POSTs the credentials and emits the user', () => {
      let emitted: unknown;
      service.login('sales1@example.com', 'password123').subscribe((user) => (emitted = user));

      const req = httpMock.expectOne('/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'sales1@example.com', password: 'password123' });
      req.flush(authResponse);

      expect(emitted).toEqual(authResponse.user);
    });

    it('stores the user and access token in memory, and the refresh token in sessionStorage', () => {
      loginAsSales();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()).toEqual(authResponse.user);
      expect(service.role()).toBe('SALES');
      expect(service.hasRole('SALES', 'ADMIN')).toBe(true);
      expect(service.hasRole('REVIEWER')).toBe(false);
      expect(service.getAccessToken()).toBe('fake.access');
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('fake.refresh');
    });

    it('never writes the access token to sessionStorage', () => {
      loginAsSales();

      expect(Object.values(sessionStorage)).not.toContain('fake.access');
    });

    it('stays logged out and propagates the error on 401', () => {
      let error: HttpErrorResponse | undefined;
      service.login('sales1@example.com', 'wrong').subscribe({ error: (e) => (error = e) });

      httpMock
        .expectOne('/api/auth/login')
        .flush(
          { message: 'Invalid email or password' },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(error?.status).toBe(401);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.getAccessToken()).toBeNull();
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears the user, both tokens, and navigates to /login', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      loginAsSales();

      service.logout();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(service.role()).toBeNull();
      expect(service.getAccessToken()).toBeNull();
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
