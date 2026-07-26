/**
 * Every deployment serves the API and the collab WebSocket same-origin as the
 * app — the Vite dev proxy, the nginx container, and the Cloudflare edge proxy
 * in production all forward /api and /yjs to the backend. Paths therefore
 * resolve against the page's own origin; there is deliberately no configurable
 * API origin any more (a second origin is what broke cookies and Safari).
 */
export function apiUrl(path: string): string {
  return path;
}

/** ws(s):// equivalent of the page origin, for the Yjs collaboration socket. */
export function websocketUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}
