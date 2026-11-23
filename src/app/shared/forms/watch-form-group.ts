import type { Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { ControlEvent, FormGroup } from '@angular/forms';
import { merge, switchMap } from 'rxjs';

/**
 * Bridges a FormGroup's state changes into a signal, so OnPush components re-render when
 * the form changes from OUTSIDE their template (e.g. a parent calls markAllAsTouched() or
 * puts server errors on a field).
 *
 * Why it's needed: Reactive Forms aren't signal-based. An OnPush component only re-renders
 * when a signal it reads changes, an input changes, or an event fires in its own template.
 *
 * Why the children too: markAllAsTouched() marks children with `onlySelf`, so their touched
 * events don't bubble up to the group's own `events` stream.
 *
 * Read the returned signal inside template helpers (e.g. showError) to create the dependency.
 * Must be called in an injection context (e.g. a field initializer).
 */
export function watchFormGroup(group: Signal<FormGroup>): Signal<ControlEvent | undefined> {
  return toSignal(
    toObservable(group).pipe(
      switchMap((g) => merge(g.events, ...Object.values(g.controls).map((c) => c.events))),
    ),
  );
}
