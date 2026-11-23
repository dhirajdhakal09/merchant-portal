import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Login and refresh calls must never trigger a refresh themselves
  if (req.url.includes('/api/auth/login') || req.url.includes('/api/auth/refresh')) {
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
