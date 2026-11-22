import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Lets authenticated users through. Otherwise redirects to /login and remembers
 * where they were going (?returnUrl=...), so login can send them back.
 *
 * UX only: it decides what the browser shows. The mock API enforces access itself.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  // Returning a UrlTree (rather than calling router.navigate) cancels this navigation
  // and starts the redirect in one step, with no flash of the protected page.
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
