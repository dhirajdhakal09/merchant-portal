import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import type { ApplicationQuery, ApplicationStatus } from '../../core/models/application.model';
import { ApplicationApiService } from '../../core/services/application-api.service';
import { LoadStateComponent } from '../../shared/components/load-state/load-state.component';
import { HasRoleDirective } from '../../shared/directives/has-role.directive';

const DEFAULT_QUERY: ApplicationQuery = { page: 1, pageSize: 10 };
/** How many page-number buttons to show at once in the pager. */
const PAGE_WINDOW = 5;

/** Human-readable label + Bootstrap badge class. The label carries the meaning; color is extra. */
const STATUS_META: Record<ApplicationStatus, { label: string; badge: string }> = {
  DRAFT: { label: 'Draft', badge: 'text-bg-secondary' },
  SUBMITTED: { label: 'Submitted', badge: 'text-bg-info' },
  IN_REVIEW: { label: 'In review', badge: 'text-bg-warning' },
  APPROVED: { label: 'Approved', badge: 'text-bg-success' },
  REJECTED: { label: 'Rejected', badge: 'text-bg-danger' }
};

@Component({
  imports: [ ReactiveFormsModule, RouterLink, DatePipe, HasRoleDirective, LoadStateComponent ],
  selector: 'app-dashboard',
  styleUrl: './dashboard.component.scss',
  templateUrl: './dashboard.component.html'
})
export default class DashboardComponent {
  private readonly api = inject(ApplicationApiService);

  protected readonly statusMeta = STATUS_META;
  protected readonly statuses = Object.keys(STATUS_META) as ApplicationStatus[];
  protected readonly pageSizes = [ 10, 20, 50 ] as const;

  /** Single source of truth for what the table shows. Every change triggers a new request. */
  protected readonly query = signal<ApplicationQuery>(DEFAULT_QUERY);

  /**
   * Loads the current page whenever `query` changes. If the query changes while a request
   * is still in flight, rxResource unsubscribes from the old one (like switchMap), so a slow,
   * outdated response can never overwrite newer results.
   */
  private readonly applications = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.getApplications(params)
  });

  protected readonly loading = this.applications.isLoading;
  protected readonly error = this.applications.error;
  /** Guarded with hasValue(): reading value() while the resource is in an error state throws. */
  protected readonly data = computed(() => (this.applications.hasValue() ? this.applications.value() : undefined));

  protected readonly currentPage = computed(() => this.data()?.page ?? this.query().page);

  protected readonly totalPages = computed(() => {
    const res = this.data();
    return res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1;
  });

  /** Page numbers around the current page, at most PAGE_WINDOW of them (e.g. 3 4 [5] 6 7). */
  protected readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const end = Math.min(total, Math.max(this.currentPage() + 2, PAGE_WINDOW));
    const start = Math.max(1, end - PAGE_WINDOW + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  /** e.g. "Showing 11–20 of 45". Based on the response, so it matches what's on screen. */
  protected readonly rangeLabel = computed(() => {
    const res = this.data();
    if (!res) {return '';}
    if (res.total === 0) {return 'Showing 0 of 0';}
    const first = (res.page - 1) * res.pageSize + 1;
    const last = Math.min(res.page * res.pageSize, res.total);
    return `Showing ${first}–${last} of ${res.total}`;
  });

  /** Different wording when nothing is filtered, so an empty account isn't told to change filters. */
  protected readonly emptyMessage = computed(() => {
    const { status, search } = this.query();
    return status || search ? 'No applications match your filters.' : 'There are no applications to show yet.';
  });

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  constructor() {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        map(value => value.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed()
      )
      .subscribe(search => this.updateFilters({ search: search || undefined }));
  }

  /** Takes the raw <select> value; anything that isn't a known status (e.g. "All") clears it. */
  protected setStatus(value: string): void {
    const status = this.statuses.find(s => s === value);
    this.updateFilters({ status });
  }

  protected goToPage(page: number): void {
    const target = Math.min(Math.max(1, page), this.totalPages());
    if (target !== this.query().page) {
      this.query.update(q => ({ ...q, page: target }));
    }
  }

  /** Takes the raw <select> value; ignores anything that isn't one of the offered sizes. */
  protected changePageSize(value: string | number): void {
    const pageSize = this.pageSizes.find(size => size === Number(value));
    if (!pageSize) {return;}
    // A different page size changes which records each page holds, so start again at page 1.
    this.query.update(q => ({ ...q, pageSize, page: 1 }));
  }

  /** Re-runs the current request, e.g. from the error state's Retry button. */
  protected retry(): void {
    this.applications.reload();
  }

  /*
   * Why filter changes reset the page to 1:
   * A filter changes the result set. If you're on page 4 and filter to "APPROVED"
   * (say 9 results, 1 page), staying on page 4 would show an empty table even though
   * matches exist. Page 1 of the new results is the only page guaranteed to make sense.
   */
  private updateFilters(changes: Pick<ApplicationQuery, 'status' | 'search'>): void {
    this.query.update(q => ({ ...q, ...changes, page: 1 }));
  }
}
