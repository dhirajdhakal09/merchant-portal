import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import type {
  MerchantApplication,
  ValidationErrorResponse,
} from '../../core/models/application.model';
import { ApplicationApiService } from '../../core/services/application-api.service';
import ApplicationWizardComponent from './application-wizard.component';

const VALID_VALUE = {
  business: {
    legalName: 'Test Momo House Pvt. Ltd.',
    tradingName: 'Test Momo',
    businessType: 'Private Limited',
    registrationNumber: 'DEMO-REG-999999',
    website: '',
  },
  owner: {
    fullName: 'Tara Example',
    email: 'tara@example.com',
    phone: '+1-555-0150',
    dateOfBirth: '1990-05-21',
  },
  bank: {
    accountHolderName: 'Test Momo House',
    bankName: 'Demo Bank of Nowhere',
    accountNumber: '0000012345',
    confirmAccountNumber: '0000012345',
    routingNumber: '000123456',
  },
};

/** Empty stand-in for routes the wizard navigates to (edit URL after create, detail after submit). */
@Component({ template: '' })
class StubPageComponent {}

describe('ApplicationWizardComponent', () => {
  let fixture: ComponentFixture<ApplicationWizardComponent>;
  let el: HTMLElement;
  let api: Record<
    'getApplication' | 'createDraft' | 'saveDraft' | 'submitApplication',
    ReturnType<typeof vi.fn>
  >;

  beforeEach(async () => {
    api = {
      getApplication: vi.fn(),
      createDraft: vi.fn(() => of({ id: 'app-200', status: 'DRAFT' } as MerchantApplication)),
      saveDraft: vi.fn((id: string) => of({ id, status: 'DRAFT' } as MerchantApplication)),
      submitApplication: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [ApplicationWizardComponent],
      providers: [
        provideRouter([
          { path: 'applications/:id/edit', component: StubPageComponent },
          { path: 'applications/:id', component: StubPageComponent },
        ]),
        { provide: ApplicationApiService, useValue: api },
      ],
    });
    fixture = TestBed.createComponent(ApplicationWizardComponent); // no id → new application
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  // --- helpers -------------------------------------------------------------------------

  const heading = () => el.querySelector('h2')?.textContent?.trim();
  const errorText = (id: string) => el.querySelector(`#${id}-error`)?.textContent?.trim();
  const form = () => (fixture.componentInstance as unknown as { form: ApplicationWizardForm }).form;

  async function clickButton(label: string): Promise<void> {
    const button = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(label),
    );
    if (!button) throw new Error(`No "${label}" button`);
    button.click();
    await fixture.whenStable();
  }

  async function typeInto(id: string, value: string): Promise<void> {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  // --- Next ------------------------------------------------------------------------------

  describe('Next', () => {
    it('stays on an invalid step, marks its fields as touched and shows their errors', async () => {
      expect(heading()).toBe('Business info');
      expect(el.querySelectorAll('.invalid-feedback').length).toBe(0); // nothing before trying

      await clickButton('Next');

      expect(heading()).toBe('Business info');
      const business = form().controls.business.controls;
      expect(business.legalName.touched).toBe(true);
      expect(business.registrationNumber.touched).toBe(true);
      expect(errorText('business-legalName')).toBe('Legal name is required.');
      expect(el.querySelector('#business-legalName')!.getAttribute('aria-invalid')).toBe('true');
    });

    it('focuses the first invalid field when Next is blocked', async () => {
      await clickButton('Next');

      expect(document.activeElement?.id).toBe('business-legalName');
    });

    it('moves to the next step when the current step is valid', async () => {
      await typeInto('business-legalName', 'Test Momo House Pvt. Ltd.');
      await typeInto('business-tradingName', 'Test Momo');
      await typeInto('business-businessType', 'Private Limited');
      await typeInto('business-registrationNumber', 'DEMO-REG-999999');

      await clickButton('Next');

      expect(heading()).toBe('Owner info');
      expect(el.querySelector('[aria-current="step"]')?.textContent).toContain('Owner info');
    });

    it('only validates the current step, not later ones', async () => {
      form().controls.business.setValue(VALID_VALUE.business); // owner and bank still empty

      await clickButton('Next');

      expect(heading()).toBe('Owner info');
      expect(form().controls.owner.controls.email.touched).toBe(false);
    });
  });

  // --- Submit with a 422 -----------------------------------------------------------------

  describe('Submit with server validation errors (422)', () => {
    const response422: ValidationErrorResponse = {
      message: 'Some fields are missing or invalid',
      errors: [
        { field: 'owner.email', message: 'This email is already registered.' },
        { field: 'bank.routingNumber', message: 'Unknown routing number.' },
      ],
    };

    async function goToReviewAndSubmit(): Promise<void> {
      form().setValue(VALID_VALUE);
      await clickButton('Next');
      await clickButton('Next');
      await clickButton('Next');
      expect(heading()).toBe('Review & submit');
      await clickButton('Submit application');
    }

    beforeEach(() => {
      api.submitApplication.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 422,
              statusText: 'Unprocessable Entity',
              error: response422,
            }),
        ),
      );
    });

    it('saves the draft first, then submits it', async () => {
      await goToReviewAndSubmit();

      expect(api.createDraft).toHaveBeenCalledTimes(1);
      expect(api.submitApplication).toHaveBeenCalledWith('app-200');
    });

    it('shows each server error on its matching field and jumps to the earliest step', async () => {
      await goToReviewAndSubmit();

      expect(heading()).toBe('Owner info');
      expect(errorText('owner-email')).toBe('This email is already registered.');
      expect(el.querySelector('#owner-email')!.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement?.id).toBe('owner-email');
      expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/highlighted fields/);

      // Fields outside the current step get their server error too.
      const routing = form().controls.bank.controls.routingNumber;
      expect(routing.getError('server')).toBe('Unknown routing number.');
    });

    it('keeps the step blocked until the flagged field is changed, then shows the next error', async () => {
      await goToReviewAndSubmit();

      await clickButton('Next'); // email still holds the value the server rejected
      expect(heading()).toBe('Owner info');

      await typeInto('owner-email', 'new.address@example.com');
      await clickButton('Next');

      expect(heading()).toBe('Bank details');
      expect(errorText('bank-routingNumber')).toBe('Unknown routing number.');
    });

    it('clears a server error as soon as the user edits that field', async () => {
      await goToReviewAndSubmit();
      expect(errorText('owner-email')).toBe('This email is already registered.');

      await typeInto('owner-email', 'new.address@example.com');

      expect(errorText('owner-email')).toBeUndefined();
      expect(form().controls.owner.controls.email.hasError('server')).toBe(false);
    });

    it('reuses the same draft when submitting again after fixing the errors', async () => {
      await goToReviewAndSubmit();
      api.submitApplication.mockReturnValue(
        of({ id: 'app-200', status: 'SUBMITTED' } as MerchantApplication),
      );

      await typeInto('owner-email', 'new.address@example.com');
      await clickButton('Next');
      await typeInto('bank-routingNumber', '000123457');
      await clickButton('Next');
      await clickButton('Submit application');

      expect(api.createDraft).toHaveBeenCalledTimes(1); // no second draft
      expect(api.saveDraft).toHaveBeenCalledWith('app-200', expect.anything());
      expect(api.submitApplication).toHaveBeenLastCalledWith('app-200');
    });
  });
});

/** The wizard's form type, for reaching into the protected `form` in tests. */
type ApplicationWizardForm = ReturnType<typeof import('./application-form').buildApplicationForm>;
