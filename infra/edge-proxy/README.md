# Edge proxy

A Cloudflare Worker that forwards `ramseytools.com/api/*` and
`ramseytools.com/yjs/*` to the backend, so the browser talks to a **single
origin**. This removes cross-origin CORS, cross-subdomain cookie issues, and the
Safari/WebKit cross-site blocking that was hiding sign-in and the AI tab on iOS.
The `/yjs` WebSocket (live collaboration) is passed through, so collab works
same-origin too.

Only `/api/*` and `/yjs/*` are attached to Worker routes; every other path stays
on Cloudflare Pages (the static SPA).

## Deploy

```bash
cd infra/edge-proxy
npm install
npx wrangler login          # once
npx wrangler deploy         # publishes to <name>.<subdomain>.workers.dev
```

## Test without touching the live site (Phase 2)

With no routes attached, the Worker is reachable only at its `workers.dev` URL:

```bash
curl https://ramsey-edge-proxy.<subdomain>.workers.dev/api/capabilities
# expect the capabilities JSON, proxied from the backend
```

## Go live (Phase 4)

Uncomment the `[[routes]]` blocks in `wrangler.toml` (or add the two routes in
the dashboard) and `npx wrangler deploy`. Routes override Pages for matching
paths; everything else is unaffected. Remove the routes to roll back instantly.

`BACKEND_ORIGIN` (in `wrangler.toml`) is the origin the proxy targets — the
existing `api.ramseytools.com`, which stays as the private backend host.
