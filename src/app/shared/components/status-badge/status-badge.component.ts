import { Component, computed, input } from '@angular/core';
import type { ApplicationStatus } from '../../../core/models/application.model';

/** Human-readable label + Bootstrap badge class. The label carries the meaning; color is extra. */
export const STATUS_META: Record<ApplicationStatus, { label: string; badge: string }> = {
  DRAFT: { label: 'Draft', badge: 'text-bg-secondary' },
  SUBMITTED: { label: 'Submitted', badge: 'text-bg-info' },
  IN_REVIEW: { label: 'In review', badge: 'text-bg-warning' },
  APPROVED: { label: 'Approved', badge: 'text-bg-success' },
  REJECTED: { label: 'Rejected', badge: 'text-bg-danger' },
};

export const APPLICATION_STATUSES = Object.keys(STATUS_META) as ApplicationStatus[];

/**
 * Status shown as a badge WITH TEXT, so its meaning never depends on color alone
 * (color-blind users, screen readers). Used by the dashboard and the detail page.
 */
@Component({
  selector: 'app-status-badge',
  template: `<span class="badge fw-medium" [class]="meta().badge">{{ meta().label }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<ApplicationStatus>();
  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
