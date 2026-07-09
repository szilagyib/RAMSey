import * as Sentry from '@sentry/react';

/**
 * Optional frontend error tracking. A no-op unless VITE_SENTRY_DSN is set, so
 * dev and tests run untouched. Mirrors the backend's config/sentry.
 */
let enabled = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (enabled || !dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0, // error tracking only
  });
  enabled = true;
}

export function captureException(err: unknown): void {
  if (!enabled) return;
  Sentry.captureException(err);
}
