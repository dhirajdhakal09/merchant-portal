import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, Observable, of, tap, throwError } from 'rxjs';
import type { AuthResponse, RefreshResponse, Role, User } from '../models/user.model';

/*
 * Token storage trade-off
 * -----------------------
 * - Memory (a signal): safest place in the browser. Malicious injected script (XSS) can't
 *   read it from storage, and it disappears when the tab closes. Downside: lost on reload.
 * - sessionStorage: survives a reload but is scoped to one tab and cleared when it closes.
 *   Readable by any script on the page, so an XSS bug could steal what's stored there.
 * - localStorage: like sessionStorage but persists across tabs and restarts, so a stolen
 *   token stays useful longer. Not used.
 * - httpOnly cookie: best option for a refresh token in production. JavaScript can't read it
 *   at all, so XSS can't steal it (the browser attaches it to /auth/refresh automatically).
 *   It needs a real server to set the cookie and CSRF protection (e.g. SameSite=Strict),
 *   which an in-browser MSW mock can't provide.
 *
 * Chosen here: the short-lived access token (60s) stays in memory only; the refresh token
 * goes in sessionStorage so a page reload can restore the session via restoreSession().
 * The main defence against XSS is still preventing it: Angular's template escaping plus a
 * Content Security Policy.
 */
const REFRESH_TOKEN_KEY = 'mp.refreshToken';

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<User | null>(null);
  private readonly _accessToken = signal<string | null>(null);

  /** The signed-in user, or null. Read-only outside this service. */
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly role = computed<Role | null>(() => this._currentUser()?.role ?? null);

  login(email: string, password: string): Observable<User> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(
      tap((res) => {
        sessionStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
        this._accessToken.set(res.accessToken);
        this._currentUser.set(res.user);
      }),
      map((res) => res.user),
    );
  }

  /**
   * Exchanges the stored refresh token for a new access token and emits it.
   * If the refresh fails (missing, invalid or expired token), the user is logged out.
   */
  refreshToken(): Observable<string> {
    return this.requestRefresh().pipe(
      catchError((err: unknown) => {
        this.logout();
        return throwError(() => err);
      }),
    );
  }

  logout(): void {
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /** True if the current user has any of the given roles. */
  hasRole(...roles: Role[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  /**
   * Runs once at app start (see provideAppInitializer in app.config.ts). The access token
   * was lost on reload because it lives in memory, so if a refresh token is stored we
   * exchange it for a new access token and the user. Never errors: if the refresh fails we
   * just start logged out. It deliberately doesn't navigate; route guards will handle that.
   */
  restoreSession(): Observable<void> {
    if (!sessionStorage.getItem(REFRESH_TOKEN_KEY)) {
      return of(undefined);
    }
    return this.requestRefresh().pipe(
      map(() => undefined),
      catchError(() => {
        this.clearSession();
        return of(undefined);
      }),
    );
  }

  /** Calls /api/auth/refresh and stores the result. Errors are left to the caller. */
  private requestRefresh(): Observable<string> {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token'));
    }
    return this.http.post<RefreshResponse>('/api/auth/refresh', { refreshToken }).pipe(
      tap((res) => {
        this._accessToken.set(res.accessToken);
        this._currentUser.set(res.user);
      }),
      map((res) => res.accessToken),
    );
  }

  private clearSession(): void {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    this._accessToken.set(null);
    this._currentUser.set(null);
  }
}
