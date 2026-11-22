import { delay, http, HttpResponse } from 'msw';
import type { AuthResponse, RefreshResponse } from '../core/models/user.model';
import { createAccessToken, createRefreshToken, verifyToken } from './auth-tokens';
import { db, toPublicUser } from './data';
import { requireAuth } from './require-auth';

/** Artificial latency so loading states are visible in the UI. */
const LATENCY_MS = 300;

/** Reads a JSON body without throwing; returns null if the body isn't valid JSON. */
async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const authHandlers = [
  http.post('/api/auth/login', async ({ request }) => {
    await delay(LATENCY_MS);
    const body = await readJson(request);
    const email = typeof body?.['email'] === 'string' ? body['email'].trim().toLowerCase() : '';
    const password = typeof body?.['password'] === 'string' ? body['password'] : '';

    const user = db.users.find((u) => u.email === email && u.password === password);
    if (!user) {
      // Same message for "unknown email" and "wrong password", so the API doesn't
      // reveal which emails have accounts.
      return HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    return HttpResponse.json<AuthResponse>({
      accessToken: createAccessToken(user.id),
      refreshToken: createRefreshToken(user.id),
      user: toPublicUser(user),
    });
  }),

  http.post('/api/auth/refresh', async ({ request }) => {
    await delay(LATENCY_MS);
    const body = await readJson(request);
    const refreshToken = typeof body?.['refreshToken'] === 'string' ? body['refreshToken'] : '';

    const userId = verifyToken(refreshToken, 'refresh');
    const user = userId ? db.users.find((u) => u.id === userId) : undefined;
    if (!user) {
      return HttpResponse.json({ message: 'Invalid or expired refresh token' }, { status: 401 });
    }

    return HttpResponse.json<RefreshResponse>({
      accessToken: createAccessToken(user.id),
      user: toPublicUser(user),
    });
  }),

  http.get('/api/auth/me', async ({ request }) => {
    await delay(LATENCY_MS);
    const auth = requireAuth(request);
    if (auth instanceof Response) return auth;
    return HttpResponse.json(auth);
  }),
];
