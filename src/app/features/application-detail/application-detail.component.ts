import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { RiskDecision } from '../../core/models/application.model';
import { ApplicationApiService } from '../../core/services/application-api.service';
import { LoadStateComponent } from '../../shared/components/load-state/load-state.component';
import { MaskedFieldComponent } from '../../shared/components/masked-field/masked-field.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { HasRoleDirective } from '../../shared/directives/has-role.directive';
import { httpStatusOf } from '../../shared/utils/http-status';
import { AssignReviewerComponent } from './assign-reviewer/assign-reviewer.component';
import { ReviewActionsComponent } from './review-actions/review-actions.component';

/** Text + color for each decision; the text carries the meaning. */
const DECISION_META: Record<RiskDecision['decision'], { label: string; badge: string }> = {
  APPROVED: { label: 'Approved', badge: 'text-bg-success' },
  REJECTED: { label: 'Rejected', badge: 'text-bg-danger' },
};

const RISK_META: Record<RiskDecision['riskLevel'], { label: string; badge: string }> = {
  LOW: { label: 'Low risk', badge: 'text-success-emphasis bg-success-subtle' },
  MEDIUM: { label: 'Medium risk', badge: 'text-warning-emphasis bg-warning-subtle' },
  HIGH: { label: 'High risk', badge: 'text-danger-emphasis bg-danger-subtle' },
};

@Component({
  imports: [
    DatePipe,
    RouterLink,
    HasRoleDirective,
    LoadStateComponent,
    MaskedFieldComponent,
    StatusBadgeComponent,
    ReviewActionsComponent,
    AssignReviewerComponent,
  ],
  selector: 'app-application-detail',
  styleUrl: './application-detail.component.scss',
  templateUrl: './application-detail.component.html',
})
export default class ApplicationDetailComponent {
  private readonly api = inject(ApplicationApiService);
  private readonly auth = inject(AuthService);

  /** The :id route param, bound by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly decisionMeta = DECISION_META;
  protected readonly riskMeta = RISK_META;

  /** Reloads automatically if the id changes (e.g. navigating from one application to another). */
  protected readonly application = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.api.getApplication(id),
  });

  /** Guarded with hasValue(): reading value() in the error state throws. */
  protected readonly app = computed(() =>
    this.application.hasValue() ? this.application.value() : undefined,
  );

  /** 404 and 403 get their own messages; anything else is a generic, retryable error. */
  protected readonly errorStatus = computed(() => httpStatusOf(this.application.error()));

  /** Newest decision first. Sorted copy: the response object isn't mutated. */
  protected readonly history = computed(() =>
    [...(this.app()?.riskHistory ?? [])].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
  );

  /**
   * Who may reveal sensitive fields: ADMIN, or the REVIEWER assigned to this application.
   * Mirrors the server's rule so the button is only offered to people the server will allow;
   * the server still enforces it (403) and audits every reveal.
   */
  protected readonly canReveal = computed(
    () => this.auth.currentUser()?.role === 'ADMIN' || this.isAssignedReviewer(),
  );

  /** The REVIEWER assigned to this application (never true for SALES or ADMIN). */
  protected readonly isAssignedReviewer = computed(() => {
    const app = this.app();
    const user = this.auth.currentUser();
    return !!app && !!user && user.role === 'REVIEWER' && app.assignedReviewerId === user.id;
  });

  /** Reviewer controls exist only while there's something to do: start, or decide. */
  protected readonly showReviewActions = computed(
    () =>
      this.isAssignedReviewer() &&
      (this.app()?.status === 'SUBMITTED' || this.app()?.status === 'IN_REVIEW'),
  );

  /** ADMIN can (re)assign only while the application is waiting for or in review. */
  protected readonly showAssign = computed(
    () => this.app()?.status === 'SUBMITTED' || this.app()?.status === 'IN_REVIEW',
  );

  /** Outcome of the last action, shown by the page so it survives the actions being removed. */
  protected readonly notice = signal<string | null>(null);

  /** A child action finished (or hit a 409): show its notice and load the latest data. */
  protected onActionDone(notice: string): void {
    this.notice.set(notice);
    this.application.reload();
  }

  /**
   * Only the SALES user who created it, and only while it's a DRAFT. (The server already only
   * returns a SALES user's own applications, and the edit route and save endpoints check again;
   * this just avoids offering a link that wouldn't work.)
   */
  protected readonly canContinueEditing = computed(() => {
    const app = this.app();
    const user = this.auth.currentUser();
    return (
      !!app &&
      !!user &&
      user.role === 'SALES' &&
      app.status === 'DRAFT' &&
      app.createdById === user.id
    );
  });
}
