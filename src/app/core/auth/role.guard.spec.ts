import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Data,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import type { Role } from '../models/user.model';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  let currentRole: Role | null;
  const hasRole = vi.fn((...roles: Role[]) => currentRole !== null && roles.includes(currentRole));

  beforeEach(() => {
    hasRole.mockClear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { hasRole } }],
    });
  });

  function runGuard(data: Data) {
    const route = { data } as ActivatedRouteSnapshot;
    const state = { url: '/applications/new' } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => roleGuard(route, state));
  }

  function serialize(result: unknown): string {
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  it('allows navigation when the user has one of the route roles', () => {
    currentRole = 'SALES';

    expect(runGuard({ roles: ['SALES'] })).toBe(true);
    expect(hasRole).toHaveBeenCalledWith('SALES');
  });

  it('redirects to /dashboard when the user role is not allowed', () => {
    currentRole = 'REVIEWER';

    const result = runGuard({ roles: ['SALES'] });

    expect(result).toBeInstanceOf(UrlTree);
    expect(serialize(result)).toBe('/dashboard');
  });

  it('fails closed: redirects when the route has no roles configured', () => {
    currentRole = 'ADMIN';

    const result = runGuard({});

    expect(result).toBeInstanceOf(UrlTree);
    expect(serialize(result)).toBe('/dashboard');
  });
});
