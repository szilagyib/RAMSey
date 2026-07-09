/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Sentry DSN; when unset, frontend error tracking is a no-op. */
  readonly VITE_SENTRY_DSN?: string;
}
