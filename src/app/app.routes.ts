import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { roleGuard } from './core/auth/role.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';
import { ShellComponent } from './core/layout/shell/shell.component';
import type { Role } from './core/models/user.model';

/**
 * Matches both wizard URLs with ONE route:
 *   applications/new        → no id
 *   applications/:id/edit   → id param
 *
 * Why one route: Angular only reuses a component when navigating within the same route
 * entry. Auto-save creates the draft on the first save and then changes the URL from
 * /applications/new to /applications/:id/edit. With two separate routes, that navigation
 * would destroy the wizard and lose what the user typed since. With one route, the
 * component stays and only its `id` input updates.
 */
export function applicationWizardMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  const [first, second, third] = segments;
  if (first?.path !== 'applications') return null;

  if (segments.length === 2 && second.path === 'new') {
    return { consumed: segments };
  }
  if (segments.length === 3 && third.path === 'edit' && second.path !== 'new') {
    return { consumed: segments, posParams: { id: second } };
  }
  return null;
}

export const routes: Routes = [
  // Public route, rendered without the app shell (no header).
  // Signed-in users are sent to the dashboard instead (guestGuard).
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login.component'),
  },
  // Authenticated area: every child renders inside the shell's <router-outlet>.
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component'),
      },
      {
        // /applications/new and /applications/:id/edit (see applicationWizardMatcher).
        // UX gate only: the API also checks that a draft belongs to this SALES user.
        matcher: applicationWizardMatcher,
        canActivate: [roleGuard],
        // Asks before leaving with unsaved or failed changes (component decides; see guard).
        canDeactivate: [unsavedChangesGuard],
        data: { roles: ['SALES'] satisfies Role[] },
        loadComponent: () => import('./features/application-wizard/application-wizard.component'),
      },
      {
        path: 'applications/:id',
        loadComponent: () => import('./features/application-detail/application-detail.component'),
      },
    ],
  },
];
