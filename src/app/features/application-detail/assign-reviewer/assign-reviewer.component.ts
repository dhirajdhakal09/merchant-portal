import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import type { MerchantApplication } from '../../../core/models/application.model';
import { ApplicationApiService } from '../../../core/services/application-api.service';

/**
 * ADMIN: assign or reassign the reviewer of a SUBMITTED / IN_REVIEW application.
 * The parent only renders this for ADMIN on those statuses; the server enforces the same
 * rules (403 / 409 / 422) whatever the UI shows.
 */
@Component({
  selector: 'app-assign-reviewer',
  templateUrl: './assign-reviewer.component.html',
})
export class AssignReviewerComponent {
  private readonly api = inject(ApplicationApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly application = input.required<MerchantApplication>();
  /** Ask the parent to reload, with a notice to show. */
  readonly changed = output<string>();

  /** Loaded once; reviewers rarely change while the page is open. */
  protected readonly reviewers = rxResource({ stream: () => this.api.getReviewers() });
  protected readonly reviewerList = computed(() =>
    this.reviewers.hasValue() ? (this.reviewers.value() ?? []) : [],
  );

  /** Starts as the current assignee and resets to it whenever the application changes. */
  protected readonly selectedId = linkedSignal(() => this.application().assignedReviewerId ?? '');

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Nothing to do if nobody is chosen, or the choice is the current assignee. */
  protected readonly canAssign = computed(
    () =>
      !this.saving() &&
      this.selectedId() !== '' &&
      this.selectedId() !== (this.application().assignedReviewerId ?? ''),
  );

  protected select(id: string): void {
    this.selectedId.set(id);
    this.error.set(null);
  }

  protected assign(): void {
    if (!this.canAssign()) return;
    const reviewerId = this.selectedId();
    this.saving.set(true);
    this.error.set(null);

    this.api
      .assignReviewer(this.application().id, reviewerId)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (app) => this.changed.emit(`Assigned to ${app.assignedReviewerName}.`),
        error: (err: unknown) => {
          const status = err instanceof HttpErrorResponse ? err.status : undefined;
          if (status === 409) {
            this.changed.emit(
              'This application was updated by someone else. Showing the latest version.',
            );
            return;
          }
          this.error.set(
            status === 422
              ? 'That reviewer is no longer available. Choose another reviewer.'
              : "Couldn't assign the reviewer. Please try again.",
          );
        },
      });
  }
}
