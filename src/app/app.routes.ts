import { Routes } from '@angular/router';
import { ShellComponent } from './core/layout/shell/shell.component';

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
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component'),
      },
      {
        path: 'applications/new',
        loadComponent: () => import('./features/application-wizard/application-wizard.component'),
      },
      {
        path: 'applications/:id',
        loadComponent: () => import('./features/application-detail/application-detail.component'),
      },
    ],
  },
];
