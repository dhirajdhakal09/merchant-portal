import { FormControl, FormGroup } from '@angular/forms';
import {
  digitsOnly,
  matchFields,
  minAge,
  optionalUrl,
  registrationNumber,
  serverError,
} from './merchant.validators';
import { BANK_RULES, BUSINESS_RULES, firstError } from './merchant-rules';

/** Runs a control-level validator against a value. */
const check = (validator: ReturnType<typeof minAge>, value: string) =>
  validator(new FormControl(value, { nonNullable: true }));

describe('merchant validators', () => {
  describe('minAge(18)', () => {
    const validator = minAge(18);

    beforeEach(() => {
      // Freeze "today" (only Date is faked, timers keep working).
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('is valid when the 18th birthday is exactly today', () => {
      expect(check(validator, '2008-11-23')).toBeNull();
    });

    it('fails one day before the 18th birthday', () => {
      expect(check(validator, '2008-11-24')).toEqual({ minAge: { required: 18 } });
    });

    it('is valid for someone clearly older', () => {
      expect(check(validator, '1990-05-21')).toBeNull();
    });

    it('fails for a future date', () => {
      expect(check(validator, '2030-01-01')).toEqual({ minAge: { required: 18 } });
    });

    it('treats an empty value as valid (required handles that)', () => {
      expect(check(validator, '')).toBeNull();
    });

    it('reports invalidDate for impossible or malformed dates', () => {
      expect(check(validator, '2001-02-30')).toEqual({ invalidDate: true });
      expect(check(validator, '23/11/2008')).toEqual({ invalidDate: true });
      expect(check(validator, 'not a date')).toEqual({ invalidDate: true });
    });

    it('handles a 29 February birthday: 18 on 1 March in a non-leap year', () => {
      vi.setSystemTime(new Date('2026-02-28T12:00:00Z'));
      expect(check(validator, '2008-02-29')).toEqual({ minAge: { required: 18 } });

      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
      expect(check(validator, '2008-02-29')).toBeNull();
    });

    it('uses the given age in the error', () => {
      expect(check(minAge(21), '2008-11-23')).toEqual({ minAge: { required: 21 } });
    });
  });

  describe('digitsOnly(6, 20)', () => {
    const validator = digitsOnly(6, 20);

    it('accepts digits at the min and max length', () => {
      expect(check(validator, '123456')).toBeNull();
      expect(check(validator, '1'.repeat(20))).toBeNull();
    });

    it('reports digitsLength when too short or too long', () => {
      expect(check(validator, '12345')).toEqual({ digitsLength: { min: 6, max: 20, actual: 5 } });
      expect(check(validator, '1'.repeat(21))).toEqual({
        digitsLength: { min: 6, max: 20, actual: 21 },
      });
    });

    it('reports digitsOnly for letters, spaces, dashes or signs', () => {
      expect(check(validator, '12a456')).toEqual({ digitsOnly: true });
      expect(check(validator, '123 456')).toEqual({ digitsOnly: true });
      expect(check(validator, '123-456')).toEqual({ digitsOnly: true });
      expect(check(validator, '-123456')).toEqual({ digitsOnly: true });
    });

    it('treats an empty value as valid', () => {
      expect(check(validator, '')).toBeNull();
    });

    it('supports an exact length, e.g. digitsOnly(9, 9) for routing numbers', () => {
      expect(check(digitsOnly(9, 9), '000123456')).toBeNull();
      expect(check(digitsOnly(9, 9), '00012345')).toEqual({
        digitsLength: { min: 9, max: 9, actual: 8 },
      });
    });
  });

  describe('registrationNumber()', () => {
    const validator = registrationNumber();

    it('accepts 5–20 letters, digits or dashes in any case', () => {
      expect(check(validator, 'DEMO-REG-100137')).toBeNull();
      expect(check(validator, 'ab123')).toBeNull(); // exactly 5
      expect(check(validator, 'A'.repeat(20))).toBeNull(); // exactly 20
    });

    it('rejects too short, too long, or other characters', () => {
      expect(check(validator, 'AB12')).toEqual({ registrationNumber: true });
      expect(check(validator, 'A'.repeat(21))).toEqual({ registrationNumber: true });
      expect(check(validator, 'AB 1234')).toEqual({ registrationNumber: true });
      expect(check(validator, 'AB_1234')).toEqual({ registrationNumber: true });
    });

    it('treats an empty value as valid', () => {
      expect(check(validator, '')).toBeNull();
    });
  });

  describe('optionalUrl()', () => {
    const validator = optionalUrl();

    it('is valid when empty or whitespace', () => {
      expect(check(validator, '')).toBeNull();
      expect(check(validator, '   ')).toBeNull();
    });

    it('accepts http and https URLs', () => {
      expect(check(validator, 'https://himalayan-coffee.example.com')).toBeNull();
      expect(check(validator, 'http://example.com/path?x=1')).toBeNull();
    });

    it('rejects other protocols and non-URLs', () => {
      expect(check(validator, 'ftp://example.com')).toEqual({ url: true });
      expect(check(validator, 'javascript:alert(1)')).toEqual({ url: true });
      expect(check(validator, 'example.com')).toEqual({ url: true }); // no protocol
      expect(check(validator, 'not a url')).toEqual({ url: true });
    });
  });

  describe('serverError()', () => {
    it('reports the server message while the field holds the rejected value', () => {
      const control = new FormControl('a@example.com', { nonNullable: true });
      control.addValidators(serverError('Already registered.', 'a@example.com'));
      control.updateValueAndValidity();

      expect(control.errors).toEqual({ server: 'Already registered.' });
    });

    it('clears as soon as the value changes', () => {
      const control = new FormControl('a@example.com', { nonNullable: true });
      control.addValidators(serverError('Already registered.', 'a@example.com'));
      control.setValue('b@example.com');

      expect(control.errors).toBeNull();
    });

    it('survives re-validation (unlike setErrors)', () => {
      const control = new FormControl('a@example.com', { nonNullable: true });
      control.addValidators(serverError('Already registered.', 'a@example.com'));
      control.updateValueAndValidity();
      control.updateValueAndValidity(); // e.g. a form directive re-attaching

      expect(control.hasError('server')).toBe(true);
    });
  });

  describe('matchFields() (group-level)', () => {
    function bankGroup(accountNumber: string, confirmAccountNumber: string) {
      return new FormGroup(
        {
          accountNumber: new FormControl(accountNumber, { nonNullable: true }),
          confirmAccountNumber: new FormControl(confirmAccountNumber, { nonNullable: true }),
        },
        { validators: matchFields('accountNumber', 'confirmAccountNumber') },
      );
    }

    it('is valid when both fields match', () => {
      expect(bankGroup('0000012345', '0000012345').errors).toBeNull();
    });

    it('sets fieldsMismatch on the GROUP, not on the controls, when they differ', () => {
      const group = bankGroup('0000012345', '0000012346');

      expect(group.errors).toEqual({ fieldsMismatch: true });
      expect(group.controls.accountNumber.errors).toBeNull();
      expect(group.controls.confirmAccountNumber.errors).toBeNull();
    });

    it('is valid while either field is still empty', () => {
      expect(bankGroup('0000012345', '').errors).toBeNull();
      expect(bankGroup('', '0000012345').errors).toBeNull();
      expect(bankGroup('', '').errors).toBeNull();
    });

    it('re-validates when EITHER field changes', () => {
      const group = bankGroup('0000012345', '0000012345');

      group.controls.accountNumber.setValue('9999999999');
      expect(group.errors).toEqual({ fieldsMismatch: true });

      group.controls.confirmAccountNumber.setValue('9999999999');
      expect(group.errors).toBeNull();
    });

    it('returns null if the named controls do not exist', () => {
      const group = new FormGroup({}, { validators: matchFields('a', 'b') });
      expect(group.errors).toBeNull();
    });
  });

  describe('agreement with the server rules', () => {
    // The wizard must never accept what the server's submit would reject (or vice versa).
    const samples = {
      registration: ['DEMO-REG-100137', 'ab123', 'AB12', 'AB 1234', 'A'.repeat(21)],
      account: ['123456', '12345', '12a456', '1'.repeat(21)],
      website: ['', 'https://x.example.com', 'ftp://x.com', 'example.com'],
    };

    it('registration number', () => {
      for (const v of samples.registration) {
        const client = check(registrationNumber(), v) === null;
        const server = firstError(BUSINESS_RULES.registrationNumber, v) === null;
        expect({ v, client }).toEqual({ v, client: server });
      }
    });

    it('account number', () => {
      for (const v of samples.account) {
        const client = check(digitsOnly(6, 20), v) === null;
        const server = firstError(BANK_RULES.accountNumber, v) === null;
        expect({ v, client }).toEqual({ v, client: server });
      }
    });

    it('website', () => {
      for (const v of samples.website) {
        const client = check(optionalUrl(), v) === null;
        const server = firstError(BUSINESS_RULES.website, v) === null;
        expect({ v, client }).toEqual({ v, client: server });
      }
    });
  });
});
