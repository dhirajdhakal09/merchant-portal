import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

/** Only requests to our own API get the bearer token. */
const API_PREFIX = '/api/';
/** Auth endpoints that must never carry a token or trigger a refresh themselves. */
const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/refresh'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Never send the token to other origins (CDNs, analytics, third-party APIs): it would leak
  // the user's credentials. Login and refresh must not trigger a refresh themselves.
  const isApiRequest = req.url.startsWith(API_PREFIX);
  const isAuthEndpoint = AUTH_ENDPOINTS.some((url) => req.url.startsWith(url));
  if (!isApiRequest || isAuthEndpoint) {
    return next(req);
  }

  const tokenUsed = auth.getAccessToken();

  return next(withToken(req, tokenUsed)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error); // 403, 500, etc. are not our job here
      }

      // Another request already refreshed while this one was in flight
      const currentToken = auth.getAccessToken();
      if (currentToken && currentToken !== tokenUsed) {
        return next(withToken(req, currentToken));
      }

      // Refresh (or join the refresh already running), then retry once
      return auth
        .refreshAccessToken()
        .pipe(switchMap((newToken) => next(withToken(req, newToken))));
    }),
  );
};

function withToken(req: HttpRequest<unknown>, token: string | null) {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}
