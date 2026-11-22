import type { AnyHandler } from 'msw';
import { authHandlers } from './auth.handlers';

/**
 * All mock API request handlers.
 * Each handler describes one fake endpoint (method + URL + response).
 * Fake data only: never put real personal or payment data here.
 */
export const handlers: AnyHandler[] = [...authHandlers];
