import { inject } from '@angular/core';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  type ValidationErrors,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import type { RiskDecision } from '../../../core/models/application.model';
import { isBlank } from '../../../shared/validators/merchant-rules';

/** Same limits as the server's decision endpoint. */
export const MIN_REJECTION_NOTES = 20;
export const MAX_NOTES = 1000;

/** Like Validators.required, but whitespace-only counts as empty (the server trims notes). */
export const requiredTrimmed: ValidatorFn = (control: AbstractControl<string>) =>
  isBlank(control.value) ? { required: true } : null;

/**
 * GROUP-level, conditional: notes need at least `min` characters, but only when the decision
 * is REJECTED. It depends on two controls, so it lives on the group: it re-runs when EITHER
 * the decision or the notes change (switching Approve → Reject re-checks the notes at once).
 * Error (on the group): { rejectionNotesTooShort: { min, actual } }
 */
export function rejectionNotesMinLength(min: number): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    if (group.get('decision')?.value !== 'REJECTED') return null;
    const notes = String(group.get('notes')?.value ?? '').trim();
    // Empty notes are reported by requiredTrimmed; don't show two errors at once.
    if (notes.length === 0 || notes.length >= min) return null;
    return { rejectionNotesTooShort: { min, actual: notes.length } };
  };
}

/** The reviewer's decision form. Call in an injection context. */
export function buildDecisionForm() {
  const fb = inject(NonNullableFormBuilder);
  return fb.group(
    {
      decision: fb.control<RiskDecision['decision'] | ''>('', Validators.required),
      riskLevel: fb.control<RiskDecision['riskLevel'] | ''>('', Validators.required),
      notes: fb.control('', [requiredTrimmed, Validators.maxLength(MAX_NOTES)]),
    },
    { validators: rejectionNotesMinLength(MIN_REJECTION_NOTES) },
  );
}

export type DecisionForm = ReturnType<typeof buildDecisionForm>;
