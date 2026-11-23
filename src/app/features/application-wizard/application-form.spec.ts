import { TestBed } from '@angular/core/testing';
import type { BankDetails, BusinessInfo, OwnerInfo } from '../../core/models/application.model';
import { buildApplicationForm } from './application-form';

describe('buildApplicationForm', () => {
  const create = () => TestBed.runInInjectionContext(() => buildApplicationForm());

  it('mirrors the model: business / owner / bank, plus confirmAccountNumber', () => {
    const form = create();

    expect(Object.keys(form.controls)).toEqual(['business', 'owner', 'bank']);
    expect(Object.keys(form.controls.business.controls)).toEqual([
      'legalName',
      'tradingName',
      'businessType',
      'registrationNumber',
      'website',
    ]);
    expect(Object.keys(form.controls.owner.controls)).toEqual([
      'fullName',
      'email',
      'phone',
      'dateOfBirth',
    ]);
    expect(Object.keys(form.controls.bank.controls)).toEqual([
      'accountHolderName',
      'bankName',
      'accountNumber',
      'confirmAccountNumber',
      'routingNumber',
    ]);

    // Compile-time check: each group's value fits the model type.
    const { business, owner, bank } = form.getRawValue();
    const typed: { business: BusinessInfo; owner: OwnerInfo; bank: BankDetails } = {
      business,
      owner,
      bank,
    };
    expect(typed.business.legalName).toBe('');
  });

  it('starts invalid with required errors, but an empty website is fine', () => {
    const form = create();
    const { business, owner, bank } = form.controls;

    expect(form.valid).toBe(false);
    expect(business.controls.legalName.hasError('required')).toBe(true);
    expect(owner.controls.email.hasError('required')).toBe(true);
    expect(bank.controls.confirmAccountNumber.hasError('required')).toBe(true);
    expect(business.controls.website.valid).toBe(true);
  });

  it('is valid with complete, correct data', () => {
    const form = create();
    form.setValue({
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
    });

    expect(form.valid).toBe(true);
  });

  it('wires the custom validators to the right controls and group', () => {
    const form = create();
    const { business, owner, bank } = form.controls;

    business.controls.registrationNumber.setValue('AB');
    business.controls.website.setValue('ftp://x.com');
    owner.controls.email.setValue('a@b'); // passes Validators.email, fails the shared pattern
    owner.controls.phone.setValue('call me');
    owner.controls.dateOfBirth.setValue('2020-01-01');
    bank.controls.accountNumber.setValue('12a');
    bank.controls.routingNumber.setValue('123');
    bank.controls.confirmAccountNumber.setValue('999');

    expect(business.controls.registrationNumber.hasError('registrationNumber')).toBe(true);
    expect(business.controls.website.hasError('url')).toBe(true);
    expect(owner.controls.email.hasError('pattern')).toBe(true);
    expect(owner.controls.phone.hasError('pattern')).toBe(true);
    expect(owner.controls.dateOfBirth.hasError('minAge')).toBe(true);
    expect(bank.controls.accountNumber.hasError('digitsOnly')).toBe(true);
    expect(bank.controls.routingNumber.hasError('digitsLength')).toBe(true);

    bank.controls.accountNumber.setValue('0000012345');
    expect(bank.hasError('fieldsMismatch')).toBe(true);
  });
});
