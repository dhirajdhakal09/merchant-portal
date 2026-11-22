import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * The browser-side MSW worker. It talks to public/mockServiceWorker.js,
 * which intercepts the app's network requests and answers them with `handlers`.
 */
export const worker = setupWorker(...handlers);
