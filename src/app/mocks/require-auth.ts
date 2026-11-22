import { HttpResponse } from 'msw';
import type { Role, User } from '../core/models/user.model';
import { verifyToken } from './auth-tokens';
import { db, toPublicUser } from './data';

/**
 * Server-side auth check for mock handlers.
 *
 * Returns the authenticated user, or a ready-made error response:
 * - 401 Unauthorized: no token, malformed/forged token, expired token, or unknown user.
 *   (The client's interceptor reacts to 401 by refreshing the token and retrying.)
 * - 403 Forbidden: valid user, but their role is not in `allowedRoles`.
 *   (Refreshing won't help, so the client must not retry.)
 *
 * Usage in a handler:
 *   const auth = requireAuth(request, ['ADMIN']);
 *   if (auth instanceof Response) return auth;
 *   // auth is the User from here on
 */
export function requireAuth(request: Request, allowedRoles?: readonly Role[]): User | Response {
  const header = request.headers.get('Authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return unauthorized('Missing bearer token');
  }

  const userId = verifyToken(token, 'access');
  if (!userId) {
    return unauthorized('Invalid or expired token');
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return unauthorized('Unknown user');
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return HttpResponse.json(
      { message: 'You do not have permission to perform this action' },
      { status: 403 },
    );
  }

  return toPublicUser(user);
}

function unauthorized(message: string): Response {
  return HttpResponse.json({ message }, { status: 401 });
}
