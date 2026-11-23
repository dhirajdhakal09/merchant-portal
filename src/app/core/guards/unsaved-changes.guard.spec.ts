import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { type HasUnsavedChanges, unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  function runGuard(component: HasUnsavedChanges, nextUrl = '/dashboard') {
    return TestBed.runInInjectionContext(() =>
      unsavedChangesGuard(
        component,
        {} as ActivatedRouteSnapshot,
        { url: '/applications/new' } as RouterStateSnapshot,
        { url: nextUrl } as RouterStateSnapshot,
      ),
    );
  }

  it('allows leaving without asking when there is nothing to lose', () => {
    const confirm = vi.spyOn(window, 'confirm');

    expect(runGuard({ leaveWarning: () => null })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks with the component message and allows leaving if the user confirms', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    expect(runGuard({ leaveWarning: () => 'Unsaved changes. Leave anyway?' })).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Unsaved changes. Leave anyway?');
  });

  it('blocks leaving if the user cancels', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(runGuard({ leaveWarning: () => 'Unsaved changes. Leave anyway?' })).toBe(false);
  });

  it('passes the destination URL to the component', () => {
    const leaveWarning = vi.fn().mockReturnValue(null);

    runGuard({ leaveWarning }, '/applications/app-046/edit');

    expect(leaveWarning).toHaveBeenCalledWith('/applications/app-046/edit');
  });
});
