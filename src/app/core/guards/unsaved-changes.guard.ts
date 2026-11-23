import type { CanDeactivateFn } from '@angular/router';

/**
 * Implemented by components that can hold unsaved work. Returns a message explaining what
 * would be lost by navigating to `nextUrl`, or null if it's safe to leave.
 */
export interface HasUnsavedChanges {
  leaveWarning(nextUrl: string): string | null;
}

/**
 * Asks the user to confirm before leaving a page with unsaved work. Generic: the component
 * decides whether there's a problem and what to say; the guard only asks.
 *
 * window.confirm() is used deliberately: it's synchronous, keyboard and screen-reader
 * accessible out of the box, and can't be dismissed by accident.
 *
 * Covers navigation INSIDE the app (links, Back/Forward, logout). Closing or reloading the
 * tab doesn't go through the router; the component handles that with `beforeunload`.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (
  component,
  _currentRoute,
  _currentState,
  nextState,
) => {
  const warning = component.leaveWarning(nextState.url);
  return warning === null || window.confirm(warning);
};
