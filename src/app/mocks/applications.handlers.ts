import { delay, http, HttpResponse } from 'msw';
import type {
  ApplicationStatus,
  MerchantApplication,
  PaginatedResponse,
} from '../core/models/application.model';
import { canViewApplication } from './application-access';
import { db } from './data';
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
];
