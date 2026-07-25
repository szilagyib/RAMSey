/**
 * Same-origin edge proxy.
 *
 * Forwards `ramseytools.com/api/*` and `ramseytools.com/yjs/*` to the backend so
 * the browser only ever talks to ONE origin. That removes the whole cross-origin
 * problem class — CORS, cookie SameSite across subdomains, and Safari/WebKit's
 * cross-site blocking (which was hiding sign-in and the AI tab on iPhone).
 *
 * Only these two prefixes are attached to Worker routes; every other path stays
 * with Cloudflare Pages (the static SPA). The WebSocket upgrade on /yjs is
 * passed straight through — building a new Request from the original preserves
 * the `Upgrade` header, and Cloudflare wires the 101 through, so live
 * collaboration works same-origin.
 */

export interface Env {
  /** Backend origin the proxy targets, e.g. https://api.ramseytools.com */
  BACKEND_ORIGIN: string;
}

const PROXIED_PREFIXES = ['/api/', '/yjs/'];

function isProxied(pathname: string): boolean {
  return PROXIED_PREFIXES.some((p) => pathname.startsWith(p));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Defensive: routes should only ever send us these paths, but if the Worker
    // is mis-scoped, don't silently swallow the rest of the site.
    if (!isProxied(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }

    const backend = new URL(env.BACKEND_ORIGIN);
    url.protocol = backend.protocol;
    url.hostname = backend.hostname;
    url.port = backend.port;

    // Rebuild from the original request so method, body, headers and — crucially
    // for /yjs — the WebSocket `Upgrade` header all carry over unchanged. The
    // backend sets its auth cookie with no Domain, so the browser scopes it to
    // the origin it actually called (ramseytools.com); Set-Cookie passes through
    // untouched, which is exactly what makes login same-origin.
    return fetch(new Request(url.toString(), request));
  },
};
