import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import type { SensitiveField } from '../../../core/models/application.model';
import { ApplicationApiService } from '../../../core/services/application-api.service';

/** How long a revealed value stays visible before it's hidden again automatically. */
export const AUTO_HIDE_MS = 30_000;

/**
 * Shows a sensitive value masked (as sent by the server) and, for permitted users, reveals
 * the full value on request via the audited reveal endpoint.
 *
 * Security:
 * - The full value only ever lives in a signal in memory: never in localStorage /
 *   sessionStorage, never logged.
 * - It's cleared on Hide, automatically after 30 seconds, when the inputs change (e.g. the
 *   page is reused for another application), and when the component is destroyed.
 * - `canReveal` only decides whether the button is SHOWN. The server decides whether the
 *   value is RETURNED (403 otherwise) and records every reveal.
 */
@Component({
  selector: 'app-masked-field',
  templateUrl: './masked-field.component.html',
})
export class MaskedFieldComponent {
  private readonly api = inject(ApplicationApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Human-readable name, e.g. "Account number" (used in "Reveal account number"). */
  readonly label = input.required<string>();
  /** The value as the server sent it, e.g. "••••2345". Empty if not provided. */
  readonly maskedValue = input.required<string>();
  readonly field = input.required<SensitiveField>();
  readonly applicationId = input.required<string>();
  readonly canReveal = input(false);

  protected readonly revealedValue = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** "Reveal account number" / "Hide account number" for screen readers. */
  protected readonly revealLabel = computed(() => `Reveal ${this.label().toLowerCase()}`);
  protected readonly hideLabel = computed(() => `Hide ${this.label().toLowerCase()}`);

  /** Readable alternative to "bullet bullet bullet bullet 2 3 4 5" for screen readers. */
  protected readonly maskedDescription = computed(() => {
    const visible = this.maskedValue().replace(/[•/\s]/g, '');
    return visible ? `Hidden, partially shown: ${visible}` : 'Hidden';
  });

  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // A different application or field: never keep showing the previous full value.
    effect(() => {
      this.applicationId();
      this.field();
      untracked(() => this.hide());
    });

    this.destroyRef.onDestroy(() => this.hide());
  }

  protected reveal(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);

    this.api
      .revealField(this.applicationId(), this.field())
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ value }) => {
          this.revealedValue.set(value);
          this.startAutoHide();
        },
        error: (err: unknown) => {
          this.error.set(
            err instanceof HttpErrorResponse && err.status === 403
              ? "You're not allowed to see this value."
              : "Couldn't reveal the value. Try again.",
          );
        },
      });
  }

  protected hide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    this.revealedValue.set(null);
  }

  private startAutoHide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }
}
