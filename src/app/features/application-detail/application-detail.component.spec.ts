import { HttpErrorResponse } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import type {
  ApplicationStatus,
  MerchantApplication,
  ValidationErrorResponse,
} from '../../core/models/application.model';
import type { Role, User } from '../../core/models/user.model';
import { ApplicationApiService } from '../../core/services/application-api.service';
import ApplicationDetailComponent from './application-detail.component';

const USERS: Record<string, User> = {
  sales: { id: 'u-sales-1', name: 'Sam Sales', email: 'sales1@example.com', role: 'SALES' },
  reviewer: {
    id: 'u-reviewer-1',
    name: 'Riley Reviewer',
    email: 'r1@example.com',
    role: 'REVIEWER',
  },
  otherReviewer: {
    id: 'u-reviewer-2',
    name: 'Robin Reviewer',
    email: 'r2@example.com',
    role: 'REVIEWER',
  },
  admin: { id: 'u-admin-1', name: 'Alex Admin', email: 'admin@example.com', role: 'ADMIN' },
};

function makeApp(
  status: ApplicationStatus,
  assignedReviewerId = 'u-reviewer-1',
): MerchantApplication {
  return {
    id: 'app-007',
    status,
    business: {
      legalName: 'Himalayan Coffee Traders Pvt. Ltd.',
      tradingName: 'Himalayan Coffee',
      businessType: 'Private Limited',
      registrationNumber: 'DEMO-REG-100959',
    },
    owner: {
      fullName: 'Maya Example',
      email: 'owner07@example.com',
      phone: '+1-555-0107',
      dateOfBirth: '••/••/1990',
    },
    bank: {
      accountHolderName: 'Himalayan Coffee Traders',
      bankName: 'Demo Bank of Nowhere',
      accountNumber: '••••2611',
      routingNumber: '••••1477',
    },
    createdById: 'u-sales-1',
    assignedReviewerId: status === 'DRAFT' ? undefined : assignedReviewerId,
    assignedReviewerName: status === 'DRAFT' ? undefined : 'Riley Reviewer',
    riskHistory: [],
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-02T09:00:00.000Z',
  };
}

describe('ApplicationDetailComponent: role-based actions', () => {
  let fixture: ComponentFixture<ApplicationDetailComponent>;
  let el: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  async function render(user: User, app: MerchantApplication): Promise<void> {
    const currentUser = signal<User | null>(user);
    const role = computed(() => currentUser()?.role ?? null);
    const fakeAuth = {
      currentUser,
      role,
      hasRole: (...roles: Role[]) => roles.includes(role()!),
    };
    api = {
      getApplication: vi.fn(() => of(app)),
      startReview: vi.fn(() => of({ ...app, status: 'IN_REVIEW' })),
      submitDecision: vi.fn(() => of({ ...app, status: 'APPROVED' })),
      getReviewers: vi.fn(() =>
        of([
          { id: 'u-reviewer-1', name: 'Riley Reviewer' },
          { id: 'u-reviewer-2', name: 'Robin Reviewer' },
        ]),
      ),
      assignReviewer: vi.fn(() =>
        of({ ...app, assignedReviewerId: 'u-reviewer-2', assignedReviewerName: 'Robin Reviewer' }),
      ),
      revealField: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [ApplicationDetailComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth },
        { provide: ApplicationApiService, useValue: api },
      ],
    });
    fixture = TestBed.createComponent(ApplicationDetailComponent);
    fixture.componentRef.setInput('id', 'app-007');
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  const text = () => el.textContent!.replace(/\s+/g, ' ');
  const buttonByText = (label: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim().startsWith(label));
  const hasReviewControls = () =>
    !!el.querySelector('app-review-actions') ||
    !!buttonByText('Start review') ||
    !!el.querySelector('#notes');

  async function choose(id: string, value: string): Promise<void> {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(id)!;
    if (input instanceof HTMLInputElement && input.type === 'radio') {
      input.click();
    } else {
      input.value = value;
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    }
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  // --- who sees what -------------------------------------------------------------------

  describe('visibility', () => {
    it('SALES sees no review controls, even on their own application under review', async () => {
      await render(USERS['sales'], makeApp('IN_REVIEW'));

      expect(hasReviewControls()).toBe(false);
      expect(el.querySelector('app-assign-reviewer')).toBeNull();
    });

    it('the assigned REVIEWER sees "Start review" on a SUBMITTED application', async () => {
      await render(USERS['reviewer'], makeApp('SUBMITTED'));

      expect(buttonByText('Start review')).toBeTruthy();
      expect(el.querySelector('#notes')).toBeNull(); // no decision form yet
    });

    it('a REVIEWER who is not assigned sees no review controls', async () => {
      await render(USERS['otherReviewer'], makeApp('SUBMITTED'));

      expect(hasReviewControls()).toBe(false);
    });

    it('the assigned REVIEWER sees the decision form on an IN_REVIEW application', async () => {
      await render(USERS['reviewer'], makeApp('IN_REVIEW'));

      expect(el.querySelector('#decision-APPROVED')).toBeTruthy();
      expect(el.querySelector('#riskLevel')).toBeTruthy();
      expect(el.querySelector('#notes')).toBeTruthy();
      expect(buttonByText('Start review')).toBeUndefined();
    });

    it('nobody sees review controls once a decision is recorded', async () => {
      await render(USERS['reviewer'], makeApp('APPROVED'));

      expect(hasReviewControls()).toBe(false);
    });

    it('ADMIN sees the reviewer assignment (not review controls) on SUBMITTED', async () => {
      await render(USERS['admin'], makeApp('SUBMITTED'));

      expect(el.querySelector('#assign-reviewer')).toBeTruthy();
      expect(hasReviewControls()).toBe(false);
    });

    it('ADMIN sees no assignment controls on DRAFT or APPROVED applications', async () => {
      await render(USERS['admin'], makeApp('APPROVED'));

      expect(el.querySelector('#assign-reviewer')).toBeNull();
    });
  });

  // --- start review --------------------------------------------------------------------

  describe('Start review', () => {
    it('calls startReview, reloads the application and shows a notice', async () => {
      await render(USERS['reviewer'], makeApp('SUBMITTED'));

      buttonByText('Start review')!.click();
      await fixture.whenStable();

      expect(api['startReview']).toHaveBeenCalledWith('app-007');
      expect(api['getApplication']).toHaveBeenCalledTimes(2); // initial load + reload
      expect(text()).toContain('Review started');
    });

    it('on 409 tells the user someone else updated it, and reloads', async () => {
      await render(USERS['reviewer'], makeApp('SUBMITTED'));
      api['startReview'].mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
      );

      buttonByText('Start review')!.click();
      await fixture.whenStable();

      expect(text()).toContain('This application was updated by someone else');
      expect(api['getApplication']).toHaveBeenCalledTimes(2);
    });
  });

  // --- decision form -------------------------------------------------------------------

  describe('decision form', () => {
    beforeEach(async () => {
      await render(USERS['reviewer'], makeApp('IN_REVIEW'));
    });

    const dialogOpen = () => el.querySelector('dialog')!.hasAttribute('open');

    it('rejecting with short notes shows a validation error and sends nothing', async () => {
      await choose('#decision-REJECTED', 'REJECTED');
      await choose('#riskLevel', 'HIGH');
      await choose('#notes', 'Too short');

      buttonByText('Review and submit decision')!.click();
      await fixture.whenStable();

      expect(el.querySelector('#notes-error')?.textContent).toContain('at least 20 characters');
      expect(el.querySelector('#notes')!.getAttribute('aria-invalid')).toBe('true');
      expect(dialogOpen()).toBe(false);
      expect(api['submitDecision']).not.toHaveBeenCalled();
    });

    it('the 20-character rule applies only to rejections (approving with short notes is fine)', async () => {
      await choose('#decision-APPROVED', 'APPROVED');
      await choose('#riskLevel', 'LOW');
      await choose('#notes', 'Looks good.');

      buttonByText('Review and submit decision')!.click();
      await fixture.whenStable();

      expect(el.querySelector('#notes-error')).toBeNull();
      expect(dialogOpen()).toBe(true);
    });

    it('requires a decision, a risk level and notes', async () => {
      buttonByText('Review and submit decision')!.click();
      await fixture.whenStable();

      expect(el.querySelector('#decision-error')).toBeTruthy();
      expect(el.querySelector('#riskLevel-error')).toBeTruthy();
      expect(el.querySelector('#notes-error')?.textContent).toContain('Notes is required');
      expect(dialogOpen()).toBe(false);
    });

    it('shows a confirmation summary first, and submits only after confirming', async () => {
      await choose('#decision-REJECTED', 'REJECTED');
      await choose('#riskLevel', 'HIGH');
      await choose('#notes', '  Ownership documents could not be verified.  ');

      buttonByText('Review and submit decision')!.click();
      await fixture.whenStable();

      expect(dialogOpen()).toBe(true);
      const dialog = el.querySelector('dialog')!.textContent!;
      expect(dialog).toContain('Reject');
      expect(dialog).toContain('High');
      expect(dialog).toContain('Ownership documents could not be verified.');
      expect(api['submitDecision']).not.toHaveBeenCalled();

      buttonByText('Confirm reject')!.click();
      await fixture.whenStable();

      expect(api['submitDecision']).toHaveBeenCalledWith('app-007', {
        decision: 'REJECTED',
        riskLevel: 'HIGH',
        notes: 'Ownership documents could not be verified.', // trimmed
      });
      expect(api['getApplication']).toHaveBeenCalledTimes(2); // reloaded
      expect(text()).toContain('Decision recorded: rejected.');
    });

    it('Cancel closes the confirmation without submitting', async () => {
      await choose('#decision-APPROVED', 'APPROVED');
      await choose('#riskLevel', 'LOW');
      await choose('#notes', 'All checks passed.');
      buttonByText('Review and submit decision')!.click();
      await fixture.whenStable();

      buttonByText('Cancel')!.click();
      await fixture.whenStable();

      expect(dialogOpen()).toBe(false);
      expect(api['submitDecision']).not.toHaveBeenCalled();
    });

    it('shows server 422 errors on the matching fields', async () => {
      const body: ValidationErrorResponse = {
        message: 'Some fields are invalid',
        errors: [{ field: 'notes', message: 'Notes must mention the documents checked.' }],
      };
      api['submitDecision'].mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 422, error: body })),
      );
      await choose('#decision-APPROVED', 'APPROVED');
      await choose('#riskLevel', 'LOW');
      await choose('#notes', 'All checks passed.');
      buttonByText('Review and submit decision')!.click();
      await fixture.whenStable();

      buttonByText('Confirm approve')!.click();
      await fixture.whenStable();

      expect(el.querySelector('#notes-error')?.textContent).toContain(
        'Notes must mention the documents checked.',
      );
      expect(text()).toContain('Please fix the highlighted fields.');
      expect(api['getApplication']).toHaveBeenCalledTimes(1); // no reload on 422
    });
  });

  // --- admin assignment ----------------------------------------------------------------

  describe('reviewer assignment (ADMIN)', () => {
    it('lists reviewers, assigns the selected one, reloads and confirms', async () => {
      await render(USERS['admin'], makeApp('SUBMITTED'));
      const select = el.querySelector<HTMLSelectElement>('#assign-reviewer')!;
      expect(Array.from(select.options).map((o) => o.text.trim())).toEqual([
        'Select a reviewer',
        'Riley Reviewer (current)',
        'Robin Reviewer',
      ]);
      expect(buttonByText('Reassign')!.disabled).toBe(true); // current reviewer selected

      await choose('#assign-reviewer', 'u-reviewer-2');
      buttonByText('Reassign')!.click();
      await fixture.whenStable();

      expect(api['assignReviewer']).toHaveBeenCalledWith('app-007', 'u-reviewer-2');
      expect(api['getApplication']).toHaveBeenCalledTimes(2);
      expect(text()).toContain('Assigned to Robin Reviewer.');
    });

    it('shows an error message when assignment fails', async () => {
      await render(USERS['admin'], makeApp('SUBMITTED'));
      api['assignReviewer'].mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );

      await choose('#assign-reviewer', 'u-reviewer-2');
      buttonByText('Reassign')!.click();
      await fixture.whenStable();

      expect(text()).toContain("Couldn't assign the reviewer");
    });
  });
});
