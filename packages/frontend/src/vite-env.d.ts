/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend HTTP origin; empty keeps local development same-origin. */
  readonly VITE_API_ORIGIN?: string;
  /** Optional WebSocket override; otherwise derived from VITE_API_ORIGIN. */
  readonly VITE_WS_ORIGIN?: string;
  /** Optional Sentry DSN; when unset, frontend error tracking is a no-op. */
  readonly VITE_SENTRY_DSN?: string;
}
