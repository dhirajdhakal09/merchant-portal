import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/**
 * There is no real backend, so the mock API must be running before the app
 * starts; otherwise the first HTTP calls could reach the network unmocked.
 * 'bypass' lets requests without a handler (assets, fonts, etc.) pass through silently.
 *
 * MSW is loaded with a dynamic import so the bundler puts it (and the mock data and
 * handlers) in a separate chunk instead of the initial bundle. It still runs in every
 * build, because there is no real API to fall back to.
 */
async function bootstrap(): Promise<void> {
  const { worker } = await import('./app/mocks/browser');
  await worker.start({ onUnhandledFrame: 'bypass' });
  await bootstrapApplication(App, appConfig);
}

bootstrap().catch((err) => console.error(err));
