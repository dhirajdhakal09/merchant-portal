import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { ShellComponent } from './core/layout/shell/shell.component';
import type { Role } from './core/models/user.model';

export const routes: Routes = [
  // Public route, rendered without the app shell (no header).
  {
    path: 'login',
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
        path: 'applications/new',
        canActivate: [roleGuard],
        data: { roles: ['SALES'] satisfies Role[] },
        loadComponent: () => import('./features/application-wizard/application-wizard.component'),
      },
      {
        // Same wizard, opened on an existing draft. UX gate only: the API must also check
        // that the draft belongs to this SALES user before allowing changes.
        path: 'applications/:id/edit',
        canActivate: [roleGuard],
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
