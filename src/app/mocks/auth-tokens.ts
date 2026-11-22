/**
 * Fake token helpers for the mock API.
 *
 * A token is "fake." + base64(JSON payload). It is NOT signed, so anyone could
 * forge one; that's acceptable only because this is a mock. A real backend
 * would issue signed JWTs and verify the signature as well as the expiry.
 */

export const ACCESS_TOKEN_TTL_MS = 60 * 1000; // 60 seconds
export const REFRESH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export type TokenType = 'access' | 'refresh';

interface TokenPayload {
  sub: string; // user id
  type: TokenType;
  exp: number; // expiry, epoch milliseconds
}

const PREFIX = 'fake.';

function createToken(userId: string, type: TokenType, ttlMs: number): string {
  const payload: TokenPayload = { sub: userId, type, exp: Date.now() + ttlMs };
  return PREFIX + btoa(JSON.stringify(payload));
}

export function createAccessToken(userId: string): string {
  return createToken(userId, 'access', ACCESS_TOKEN_TTL_MS);
}

export function createRefreshToken(userId: string): string {
  return createToken(userId, 'refresh', REFRESH_TOKEN_TTL_MS);
}

/**
 * Returns the user id if the token is well-formed, of the expected type and not
 * expired; otherwise null. Checking `type` stops a refresh token from being used
 * as an access token (and vice versa).
 */
export function verifyToken(token: string, expectedType: TokenType): string | null {
  if (!token.startsWith(PREFIX)) return null;

  let payload: Partial<TokenPayload>;
  try {
    payload = JSON.parse(atob(token.slice(PREFIX.length)));
  } catch {
    return null; // not valid base64 or not valid JSON
  }

  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.type !== expectedType) return null;
  if (payload.exp <= Date.now()) return null; // expired

  return payload.sub;
}
