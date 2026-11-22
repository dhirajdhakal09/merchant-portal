import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { worker } from './app/mocks/browser';

/**
 * There is no real backend, so the mock API must be running before the app
 * starts; otherwise the first HTTP calls could reach the network unmocked.
 * 'bypass' lets requests without a handler (assets, fonts, etc.) pass through silently.
 */
async function bootstrap(): Promise<void> {
  await worker.start({ onUnhandledFrame: 'bypass' });
  await bootstrapApplication(App, appConfig);
}

bootstrap().catch((err) => console.error(err));
