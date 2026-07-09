import * as Sentry from '@sentry/node';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Optional error tracking. A no-op unless SENTRY_DSN is set, so dev and tests
 * run untouched. Call initSentry() once at process startup (API and worker);
 * use captureException() at the points where we'd otherwise lose an error.
 */
let enabled = false;

export function initSentry(): void {
  if (enabled || !env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Error tracking only for now — no performance tracing.
    tracesSampleRate: 0,
  });
  enabled = true;
  logger.info('Sentry error tracking enabled');
}

export function captureException(err: unknown): void {
  if (!enabled) return;
  Sentry.captureException(err);
}
