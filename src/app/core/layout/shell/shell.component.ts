import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { HasRoleDirective } from '../../../shared/directives/has-role.directive';

@Component({
  imports: [ RouterOutlet, RouterLink, RouterLinkActive, HasRoleDirective ],
  selector: 'app-shell',
  styleUrl: './shell.component.scss',
  templateUrl: './shell.component.html'
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);

  protected logout(): void {
    this.auth.logout();
  }
}
