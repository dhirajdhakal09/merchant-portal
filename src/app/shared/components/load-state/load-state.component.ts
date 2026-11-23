import { Component, input, output } from '@angular/core';

export type LoadState = 'loading' | 'error' | 'empty';

/**
 * Presentational loading / error / empty block. Knows nothing about what is being
 * loaded; the parent passes the state and message and handles `retry`.
 *
 * Wrap it in an element with aria-live="polite" that stays in the DOM, so screen
 * readers announce the state changes.
 */
@Component({
  imports: [],
  selector: 'app-load-state',
  styleUrl: './load-state.component.scss',
  templateUrl: './load-state.component.html',
})
export class LoadStateComponent {
  readonly state = input.required<LoadState>();
  /** Loading: visually hidden text for screen readers. Error/empty: visible text. */
  readonly message = input.required<string>();
  /** Emitted when the user clicks Retry in the error state. */
  readonly retry = output<void>();
}
