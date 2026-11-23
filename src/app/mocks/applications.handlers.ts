import { delay, http, HttpResponse } from 'msw';
import type {
  ApplicationStatus,
  MerchantApplication,
  PaginatedResponse,
  ValidationErrorResponse,
} from '../core/models/application.model';
import { validateApplication } from '../shared/validators/merchant-rules';
import { canViewApplication } from './application-access';
import { emptyDetails, mergeDraft, nextApplicationId } from './application-drafts';
import { db } from './data';
import { readJson } from './http-utils';
import { requireAuth } from './require-auth';

/** Artificial latency so loading states are visible in the UI. */
const LATENCY_MS = 300;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const STATUSES: readonly ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
];

/** Parses a positive integer query param, falling back to `fallback` and capping at `max`. */
function positiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

const errorResponse = (status: number, message: string) =>
  HttpResponse.json({ message }, { status });

/**
 * Shared checks for changing a draft (save and submit), in order:
 * 401/403 not a signed-in SALES user → 404 no such application →
 * 403 not the creator → 409 no longer a draft.
 * Returns the application, or the error response to send.
 */
function findOwnDraft(request: Request, id: unknown): MerchantApplication | Response {
  const auth = requireAuth(request, ['SALES']);
  if (auth instanceof Response) return auth;

  const app = db.applications.find((a) => a.id === id);
  if (!app) {
    return errorResponse(404, 'Application not found');
  }
  if (app.createdById !== auth.id) {
    return errorResponse(403, 'Only the creator can change this application');
  }
  if (app.status !== 'DRAFT') {
    // 409 Conflict: the request is valid, but the application's current state forbids it.
    return errorResponse(409, `Application is ${app.status} and can no longer be edited`);
  }
  return app;
}

export const applicationHandlers = [
  http.get('/api/applications', async ({ request }) => {
    await delay(LATENCY_MS);
    const auth = requireAuth(request); // any signed-in role
    if (auth instanceof Response) return auth;

    const params = new URL(request.url).searchParams;
    const page = positiveInt(params.get('page'), 1);
    const pageSize = positiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const status = params.get('status');
    const search = params.get('search')?.trim().toLowerCase() ?? '';

    // Demo hook: lets the UI's error and retry states be shown on demand.
    if (search === 'fail') {
      return HttpResponse.json({ message: 'Simulated server error' }, { status: 500 });
    }
    if (status && !STATUSES.includes(status as ApplicationStatus)) {
      return HttpResponse.json({ message: `Unknown status "${status}"` }, { status: 400 });
    }

    // 1. Role scoping first, so later steps (and `total`) only ever see permitted records.
    let results = db.applications.filter((app) => canViewApplication(auth, app));
    // 2. Status filter
    if (status) {
      results = results.filter((app) => app.status === status);
    }
    // 3. Search: case-insensitive match on legal or trading name
    if (search) {
      results = results.filter(
        (app) =>
          app.business.legalName.toLowerCase().includes(search) ||
          app.business.tradingName.toLowerCase().includes(search),
      );
    }
    // 4. Newest activity first (ISO strings sort correctly as text). Copy before sorting.
    results = [...results].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    // 5. Paginate. A page past the end returns no items but the real total.
    const start = (page - 1) * pageSize;

    return HttpResponse.json<PaginatedResponse<MerchantApplication>>({
      items: results.slice(start, start + pageSize),
      total: results.length,
      page,
      pageSize,
    });
  }),

  http.get('/api/applications/:id', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const auth = requireAuth(request);
    if (auth instanceof Response) return auth;

    const app = db.applications.find((a) => a.id === params['id']);
    if (!app) {
      return HttpResponse.json({ message: 'Application not found' }, { status: 404 });
    }
    if (!canViewApplication(auth, app)) {
      return HttpResponse.json(
        { message: 'You do not have permission to view this application' },
        { status: 403 },
      );
    }

    return HttpResponse.json<MerchantApplication>(app);
  }),

  /** Create a new draft. SALES only; fields may be empty or missing. */
  http.post('/api/applications', async ({ request }) => {
    await delay(LATENCY_MS);
    const auth = requireAuth(request, ['SALES']);
    if (auth instanceof Response) return auth;

    const now = new Date().toISOString();
    const app: MerchantApplication = {
      id: nextApplicationId(),
      status: 'DRAFT', // always DRAFT, whatever the body says
      ...mergeDraft(emptyDetails(), await readJson(request)),
      createdById: auth.id, // from the verified token, never from the body
      riskHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    db.applications.push(app);

    return HttpResponse.json<MerchantApplication>(app, { status: 201 });
  }),

  /** Save partial draft data (auto-save). Creator only, DRAFT only. */
  http.put('/api/applications/:id/draft', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const app = findOwnDraft(request, params['id']);
    if (app instanceof Response) return app;

    const merged = mergeDraft(app, await readJson(request));

    // Demo hook: lets the UI's auto-save error handling be shown on demand. Nothing is saved.
    if (merged.business.legalName.toLowerCase().includes('savefail')) {
      return errorResponse(500, 'Simulated save failure');
    }

    Object.assign(app, merged, { updatedAt: new Date().toISOString() });
    return HttpResponse.json<MerchantApplication>(app);
  }),

  /** Submit a draft for review. Creator only, DRAFT only, and the saved data must be valid. */
  http.post('/api/applications/:id/submit', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const app = findOwnDraft(request, params['id']);
    if (app instanceof Response) return app;

    // Validate what is actually stored on the server, not what the client claims.
    const errors = validateApplication(app);
    if (errors.length > 0) {
      return HttpResponse.json<ValidationErrorResponse>(
        { message: 'Some fields are missing or invalid', errors },
        { status: 422 },
      );
    }

    Object.assign(app, { status: 'SUBMITTED', updatedAt: new Date().toISOString() });
    return HttpResponse.json<MerchantApplication>(app);
  }),
];
