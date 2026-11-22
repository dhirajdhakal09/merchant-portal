import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import type { Role } from '../../core/models/user.model';

/**
 * Fake accounts shown to reviewers. Kept here rather than imported from mocks/,
 * so the feature doesn't depend on mock code.
 */
const DEMO_ACCOUNTS: readonly { email: string; role: Role }[] = [
  { email: 'sales1@example.com', role: 'SALES' },
  { email: 'sales2@example.com', role: 'SALES' },
  { email: 'reviewer1@example.com', role: 'REVIEWER' },
  { email: 'reviewer2@example.com', role: 'REVIEWER' },
  { email: 'admin@example.com', role: 'ADMIN' },
];

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.component.scss',
  templateUrl: './login.component.html',
})
export default class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the ?returnUrl= query param (withComponentInputBinding). */
  readonly returnUrl = input<string>();

  protected readonly demoAccounts = DEMO_ACCOUNTS;
  protected readonly demoPassword = 'password123';
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  /** Field errors appear only after the user has left the field (or tried to submit). */
  protected showErrors(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // reveal errors on every field
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth
      .login(email, password)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => void this.router.navigateByUrl(this.safeReturnUrl()),
        error: (err: unknown) => {
          this.errorMessage.set(
            err instanceof HttpErrorResponse && err.status === 401
              ? 'Invalid email or password.'
              : 'Something went wrong. Please try again.',
          );
        },
      });
  }

  /**
   * Only allow in-app paths. Rejecting "//evil.com" and "https://..." prevents an
   * open redirect, where a crafted link sends users to another site after login.
   */
  private safeReturnUrl(): string {
    const url = this.returnUrl();
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/dashboard';
  }
}
