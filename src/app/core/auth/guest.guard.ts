import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * For pages meant only for signed-out users (the login page). An already signed-in user
 * is sent to /dashboard instead of seeing the login form again.
 *
 * UX only, like the other guards: it changes what the browser shows, not what the API allows.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
