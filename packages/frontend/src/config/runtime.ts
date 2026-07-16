const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');
const websocketOrigin = (import.meta.env.VITE_WS_ORIGIN ?? '').replace(/\/$/, '');

/** Resolve API paths against the deployed backend; local development stays same-origin. */
export function apiUrl(path: string): string {
  return `${apiOrigin}${path}`;
}

/**
 * Resolve WebSocket paths independently when requested, otherwise derive them
 * from the API origin. This keeps preview deployments configurable without
 * baking production hostnames into the bundle.
 */
export function websocketUrl(path: string): string {
  if (websocketOrigin) return `${websocketOrigin}${path}`;
  if (apiOrigin) return `${apiOrigin.replace(/^http/, 'ws')}${path}`;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}
