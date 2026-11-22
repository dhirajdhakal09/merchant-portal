/** The three permission levels in the portal. Drives guards and role-aware UI. */
export type Role = 'SALES' | 'REVIEWER' | 'ADMIN';

/** The signed-in user, as returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** Response from login and token refresh. */
export interface AuthResponse {
  /** Short-lived token sent as `Authorization: Bearer <token>` on API calls. */
  accessToken: string;
  /** Longer-lived token exchanged at POST /auth/refresh for a new access token. */
  refreshToken: string;
  user: User;
}

/** Response from POST /auth/refresh: a new access token; the refresh token stays the same. */
export type RefreshResponse = Omit<AuthResponse, 'refreshToken'>;
