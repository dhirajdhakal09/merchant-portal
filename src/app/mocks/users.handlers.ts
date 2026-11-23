import { delay, http, HttpResponse } from 'msw';
import type { Role, UserSummary } from '../core/models/user.model';
import { db } from './data';
import { errorResponse } from './http-utils';
import { requireAuth } from './require-auth';

const ROLES: readonly Role[] = ['SALES', 'REVIEWER', 'ADMIN'];

export const userHandlers = [
  /**
   * GET /api/users?role=REVIEWER — ADMIN only, for the assignment dropdown.
   * Returns only id and name: no emails, no passwords, nothing the dropdown doesn't need.
   */
  http.get('/api/users', async ({ request }) => {
    await delay(300);
    const auth = requireAuth(request, ['ADMIN']);
    if (auth instanceof Response) return auth;

    const role = new URL(request.url).searchParams.get('role');
    if (role !== null && !ROLES.includes(role as Role)) {
      return errorResponse(400, `Unknown role "${role}"`);
    }

    const users = role ? db.users.filter((u) => u.role === role) : db.users;
    return HttpResponse.json<UserSummary[]>(users.map(({ id, name }) => ({ id, name })));
  }),
];
