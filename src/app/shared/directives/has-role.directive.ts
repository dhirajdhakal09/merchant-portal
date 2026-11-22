import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import type { Role } from '../../core/models/user.model';

/**
 * Structural directive: renders its content only for the given roles.
 *
 *   <a *appHasRole="['SALES']" routerLink="/applications/new">New application</a>
 *
 * Reactive: the effect re-runs whenever the allowed roles (input signal) or the
 * user's role (signal in AuthService) change, e.g. on login or logout.
 *
 * Hides UI only. It is NOT a security control; the API must check permissions too.
 */
@Directive({
  selector: '[appHasRole]',
})
export class HasRoleDirective {
  readonly appHasRole = input.required<readonly Role[]>();

  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);
  private hasView = false;

  constructor() {
    effect(() => {
      const allowed = this.auth.hasRole(...this.appHasRole());

      // Only touch the DOM when visibility actually changes.
      if (allowed && !this.hasView) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.hasView = true;
      } else if (!allowed && this.hasView) {
        this.viewContainer.clear();
        this.hasView = false;
      }
    });
  }
}
