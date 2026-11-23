import type { AnyHandler } from 'msw';
import { applicationHandlers } from './applications.handlers';
import { authHandlers } from './auth.handlers';
import { reviewHandlers } from './review.handlers';
import { userHandlers } from './users.handlers';

/**
 * All mock API request handlers.
 * Each handler describes one fake endpoint (method + URL + response).
 * Fake data only: never put real personal or payment data here.
 */
export const handlers: AnyHandler[] = [
  ...authHandlers,
  ...applicationHandlers,
  ...reviewHandlers,
  ...userHandlers,
];
