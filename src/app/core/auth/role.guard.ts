import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { Role } from '../models/user.model';
import { AuthService } from './auth.service';

/**
 * Allows the route only if the user's role is listed in `data.roles`:
 *   { path: 'applications/new', canActivate: [roleGuard], data: { roles: ['SALES'] } }
 * Otherwise redirects to /dashboard.
 *
 * Fails closed: a route with no `roles` configured is denied, so a missing config
 * can't silently open a page to everyone.
 *
 * UX only: it decides what the browser shows. The mock API enforces access itself.
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowedRoles = (route.data['roles'] ?? []) as Role[];

  return auth.hasRole(...allowedRoles) ? true : router.createUrlTree(['/dashboard']);
};
