import { delay, http, HttpResponse } from 'msw';
import type {
  ApplicationStatus,
  FieldError,
  MerchantApplication,
  RevealResponse,
  RiskDecision,
} from '../core/models/application.model';
import type { User } from '../core/models/user.model';
import { db } from './data';
import { errorResponse, readJson, validationError } from './http-utils';
import { isSensitiveField, maskApplication, readSensitiveField } from './masking';
import { requireAuth } from './require-auth';

/*
 * Review workflow endpoints: reveal a sensitive field, start a review, record a decision,
 * and assign a reviewer. Every rule is enforced HERE, on the server, whatever the UI shows.
 *
 * Check order everywhere: 401 (not signed in) / 403 (wrong role) → 404 (no such application)
 * → 403 (not YOUR application) → 409 (wrong status) → 422 (invalid body).
 */

const LATENCY_MS = 300;
const DECISIONS: readonly RiskDecision['decision'][] = ['APPROVED', 'REJECTED'];
const RISK_LEVELS: readonly RiskDecision['riskLevel'][] = ['LOW', 'MEDIUM', 'HIGH'];
const MIN_REJECTION_NOTES = 20;
const MAX_NOTES = 1000;

function findApplication(id: unknown): MerchantApplication | Response {
  return db.applications.find((a) => a.id === id) ?? errorResponse(404, 'Application not found');
}

const isAssignedReviewer = (user: User, app: MerchantApplication) =>
  user.role === 'REVIEWER' && app.assignedReviewerId === user.id;

/** 409 unless the application is in one of the allowed statuses. */
function requireStatus(
  app: MerchantApplication,
  allowed: readonly ApplicationStatus[],
): Response | null {
  return allowed.includes(app.status)
    ? null
    : errorResponse(409, `Not allowed while the application is ${app.status}`);
}

export const reviewHandlers = [
  /**
   * Reveal ONE sensitive field in full. ADMIN, or the REVIEWER assigned to this application.
   * Every successful reveal is recorded in the audit log.
   */
  http.post('/api/applications/:id/reveal', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const auth = requireAuth(request);
    if (auth instanceof Response) return auth;

    const app = findApplication(params['id']);
    if (app instanceof Response) return app;

    if (!(auth.role === 'ADMIN' || isAssignedReviewer(auth, app))) {
      return errorResponse(403, 'You are not allowed to reveal this information');
    }

    const field = (await readJson(request))?.['field'];
    if (!isSensitiveField(field)) {
      return validationError([{ field: 'field', message: 'Unknown or non-sensitive field' }]);
    }

    db.auditLog.push({
      userId: auth.id, // from the verified token
      field,
      applicationId: app.id,
      at: new Date().toISOString(),
    });

    return HttpResponse.json<RevealResponse>({ field, value: readSensitiveField(app, field) });
  }),

  /** The assigned REVIEWER starts reviewing: SUBMITTED → IN_REVIEW. */
  http.post('/api/applications/:id/start-review', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const auth = requireAuth(request, ['REVIEWER']);
    if (auth instanceof Response) return auth;

    const app = findApplication(params['id']);
    if (app instanceof Response) return app;
    if (!isAssignedReviewer(auth, app)) {
      return errorResponse(403, 'Only the assigned reviewer can start this review');
    }
    const conflict = requireStatus(app, ['SUBMITTED']);
    if (conflict) return conflict;

    Object.assign(app, { status: 'IN_REVIEW', updatedAt: new Date().toISOString() });
    return HttpResponse.json<MerchantApplication>(maskApplication(app));
  }),

  /** The assigned REVIEWER records a decision on an IN_REVIEW application. */
  http.post('/api/applications/:id/decision', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const auth = requireAuth(request, ['REVIEWER']);
    if (auth instanceof Response) return auth;

    const app = findApplication(params['id']);
    if (app instanceof Response) return app;
    if (!isAssignedReviewer(auth, app)) {
      return errorResponse(403, 'Only the assigned reviewer can record a decision');
    }
    const conflict = requireStatus(app, ['IN_REVIEW']);
    if (conflict) return conflict;

    const body = (await readJson(request)) ?? {};
    const decision = body['decision'];
    const riskLevel = body['riskLevel'];
    const notes = typeof body['notes'] === 'string' ? body['notes'].trim() : '';

    const errors: FieldError[] = [];
    if (!DECISIONS.includes(decision as RiskDecision['decision'])) {
      errors.push({ field: 'decision', message: 'Choose Approve or Reject.' });
    }
    if (!RISK_LEVELS.includes(riskLevel as RiskDecision['riskLevel'])) {
      errors.push({ field: 'riskLevel', message: 'Choose a risk level: LOW, MEDIUM or HIGH.' });
    }
    if (!notes) {
      errors.push({ field: 'notes', message: 'Notes are required.' });
    } else if (decision === 'REJECTED' && notes.length < MIN_REJECTION_NOTES) {
      errors.push({
        field: 'notes',
        message: `Explain the rejection in at least ${MIN_REJECTION_NOTES} characters.`,
      });
    } else if (notes.length > MAX_NOTES) {
      errors.push({ field: 'notes', message: `Notes must be at most ${MAX_NOTES} characters.` });
    }
    if (errors.length > 0) return validationError(errors);

    const now = new Date().toISOString();
    app.riskHistory.push({
      id: `${app.id}-rd-${app.riskHistory.length + 1}`,
      decision: decision as RiskDecision['decision'],
      riskLevel: riskLevel as RiskDecision['riskLevel'],
      notes,
      reviewerId: auth.id, // identity from the token, never the body
      reviewerName: auth.name,
      decidedAt: now,
    });
    Object.assign(app, { status: decision, updatedAt: now });

    return HttpResponse.json<MerchantApplication>(maskApplication(app));
  }),

  /** ADMIN assigns (or reassigns) a reviewer while the application is SUBMITTED or IN_REVIEW. */
  http.put('/api/applications/:id/assign', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const auth = requireAuth(request, ['ADMIN']);
    if (auth instanceof Response) return auth;

    const app = findApplication(params['id']);
    if (app instanceof Response) return app;
    const conflict = requireStatus(app, ['SUBMITTED', 'IN_REVIEW']);
    if (conflict) return conflict;

    const reviewerId = (await readJson(request))?.['reviewerId'];
    const reviewer = db.users.find((u) => u.id === reviewerId && u.role === 'REVIEWER');
    if (!reviewer) {
      return validationError([{ field: 'reviewerId', message: 'Choose an existing reviewer.' }]);
    }

    Object.assign(app, {
      assignedReviewerId: reviewer.id,
      assignedReviewerName: reviewer.name,
      updatedAt: new Date().toISOString(),
    });
    return HttpResponse.json<MerchantApplication>(maskApplication(app));
  }),
];
