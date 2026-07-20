# RAMSey Operations Runbook

Everything an operator needs to deploy, configure, and run RAMSey. The
authoritative sources are `packages/backend/src/config/env.ts` (validation)
and `packages/backend/src/config/limits.ts` (every tunable limit/budget in one
place) — this document mirrors them.

## Environment variables

| Variable                                                            | Required | Default                  | Purpose                                                                                                           |
| ------------------------------------------------------------------- | -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                      | **yes**  | —                        | Postgres connection string                                                                                        |
| `JWT_SECRET`                                                        | **yes**  | —                        | JWT signing secret, ≥32 chars (`openssl rand -base64 48`)                                                         |
| `PORT`                                                              | no       | `3000`                   | API port                                                                                                          |
| `NODE_ENV`                                                          | no       | `development`            | `development` / `production` / `test`                                                                             |
| `REDIS_URL`                                                         | no       | `redis://localhost:6379` | Shared rate-limit counters across replicas. The limiter **fails open** if Redis is unreachable                    |
| `CORS_ORIGIN`                                                       | no       | `http://localhost:5173`  | Allowed browser origin                                                                                            |
| `FRONTEND_URL`                                                      | no       | `http://localhost:5173`  | Base URL in emailed links + OAuth redirects                                                                       |
| `PUBLIC_API_URL`                                                    | no       | `http://localhost:3000`  | Public API base URL used for OAuth callbacks                                                                      |
| `TRUST_PROXY`                                                       | no       | —                        | Comma-separated trusted proxy CIDRs/IPs used to resolve the real client IP                                        |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                         | no       | —                        | Google OAuth; the login button is hidden when unset                                                               |
| `ANTHROPIC_API_KEY`                                                 | no       | —                        | AI chat key, Anthropic only. Shorthand for `AI_API_KEY` — see "AI provider" below                                 |
| `AI_PROVIDER`                                                       | no       | `anthropic`              | `anthropic` or `openai`. An unrecognised value disables AI chat rather than blocking boot                          |
| `AI_API_KEY`                                                        | no       | —                        | Key for the chosen provider; takes precedence over `ANTHROPIC_API_KEY`                                            |
| `AI_MODEL`                                                          | no       | see below                | Model id. Defaults to the house Claude model for `anthropic`; **required** for `openai`                           |
| `AI_BASE_URL`                                                       | no       | —                        | OpenAI-compatible endpoint (Azure, OpenRouter, Ollama, vLLM). Also changes the privacy label the UI shows          |
| `AI_PROVIDER_LABEL`                                                 | no       | derived                  | Overrides the destination name shown in the chat panel's privacy notice                                           |
| `AI_BUDGET_PER_SESSION_TOKENS`                                      | no       | `200000`                 | AI cost ceiling, per chat session                                                                                 |
| `AI_BUDGET_PER_USER_MONTHLY_TOKENS`                                 | no       | `2000000`                | AI cost ceiling, per user per UTC month                                                                           |
| `AI_BUDGET_TOTAL_MONTHLY_TOKENS`                                    | no       | `50000000`               | AI cost ceiling, global per UTC month                                                                             |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | no       | port `587`               | Verification/reset emails. When `SMTP_HOST` is unset, links are **logged** instead of sent — set it in production |
| `SENTRY_DSN`                                                        | no       | —                        | Backend error tracking (no-op when unset)                                                                         |
| `VITE_SENTRY_DSN`                                                   | no       | —                        | Frontend error tracking (build-time, Vite)                                                                        |
| `VITE_API_ORIGIN`                                                   | no       | same origin              | Backend HTTP origin embedded in the frontend build                                                                |
| `VITE_WS_ORIGIN`                                                    | no       | derived                  | Optional WebSocket origin override                                                                                |

Code-constant limits (rate limits, chat bounds, tool-call cap, token TTLs,
worker retry, `chat_usage` retention) live in `config/limits.ts` — change them
there, in one place.

**Dark-launch:** optional features hide themselves when unconfigured.
`GET /api/capabilities` reports `{ aiChat, aiProviderLabel, serverAnalysis,
googleOAuth }`; the UI drops the AI Chat tab when no AI provider resolves, and
the "Run on server" toggle when the analysis queue isn't running (client-side
analysis still works). A minimal cheap deployment is therefore: no API key, no
solver-worker container.

## AI provider

The assistant talks to Anthropic or to any OpenAI-compatible endpoint, selected
per deployment. `services/llm/` holds one adapter per provider behind a single
streaming interface; nothing outside that directory imports a provider SDK.

```bash
# Anthropic (default — an existing ANTHROPIC_API_KEY alone still works)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4.1-mini

# Any OpenAI-compatible endpoint
AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL=llama-3.3-70b
AI_BASE_URL=https://openrouter.ai/api/v1
```

Configuration resolves on every capabilities request and never throws: a bad
`AI_PROVIDER`, a missing key, or `openai` without `AI_MODEL` all disable AI chat
and hide the tab, exactly as an unset key already did. The backend still boots.

**What an `AI_BASE_URL` endpoint must support.** The OpenAI adapter streams with
`stream_options: {include_usage: true}`, without which no usage is reported and
the cost ceiling would charge zero for every turn. Managed OpenAI, Azure,
OpenRouter, recent Ollama and vLLM all accept it; a stricter or older proxy may
reject the request outright. It also relies on `finish_reason` to decide whether
to run another tool round — an endpoint that omits it stops the assistant after
one round, so tool calls still apply but larger diagrams stop early. Test a new
endpoint with a multi-step prompt ("build a 2oo3 voted pump station") before
trusting it.

**Privacy notice.** The chat panel names where diagram data is sent, from
`aiProviderLabel`. With `AI_BASE_URL` set the label defaults to that URL's
hostname rather than the provider name — a deployment pointed at OpenRouter or a
self-hosted model must not claim data goes to OpenAI. Use `AI_PROVIDER_LABEL` to
word it exactly. Whenever you change the provider, revisit the subprocessor
section of the privacy policy (`PrivacyPage.tsx`) to match.

**Budgets are denominated in tokens, not currency.** `AI_BUDGET_*` defaults were
set against Claude Sonnet pricing; the same ceilings allow far more spend-value
on a cheaper model and far less on a more expensive one. Re-tune them when you
switch models.

### What the cost ceiling does and does not stop

The two monthly tiers are the real controls: they key on the authenticated user
id and a UTC month, both server-derived, so a client cannot influence them.

The per-session tier is a **guardrail, not a security boundary**. `sessionId`
comes from the request body, so a crafted client can send a fresh id per request
and never accumulate against it. It bounds a runaway editing session; it does
not bound a determined user. The monthly tiers are what actually cap spend.

Two known gaps, neither a regression — worth knowing before you set the numbers:

- **Concurrency.** The budget is checked before a turn and recorded after it, so
  simultaneous requests can all pass the check before any of them records. The
  chat rate limit (20/min) bounds the overshoot rather than eliminating it.
- **A turn that crosses a tier still completes.** By design — the *next* request
  is the one refused.

Watch for `chat turn reported zero tokens — AI budget is not being enforced` in
the logs. It means the provider returned no usage, so nothing is being recorded
and the ceiling has silently stopped working — almost always an endpoint that
ignores `stream_options.include_usage`.

## Deploy

Production uses two deliberately small pieces:

- **Frontend:** Cloudflare Pages builds `npm run build:frontend` from `main`
  and serves `ramseytools.com`.
- **Backend:** a free-tier EC2 instance in `eu-central-1` runs
  `docker/docker-compose.host.yml` (Postgres, Redis, API, backups, and a
  Cloudflare Tunnel connector). No application ports are exposed publicly;
  TLS and ingress terminate at Cloudflare.

Cloudflare Pages deploys frontend changes automatically after a push to
`main`. Backend changes are deployed on the host:

```bash
cd ~/RAMSey
git pull
docker compose --env-file docker/.env \
  -f docker/docker-compose.host.yml up -d --build
```

- **Migrations run automatically**: the backend container executes
  `prisma migrate deploy` on start. Manual equivalent:
  `npm run db:migrate:deploy -w packages/backend`.
- Compose-only changes can omit `--build`.
- The single-host production stack intentionally omits the solver worker;
  analysis falls back to the browser.

## Secret rotation

- **`JWT_SECRET`**: rotating it invalidates _every_ session immediately (all
  tokens fail signature verification); users just log in again. Safe to rotate
  any time; prefer a low-traffic window.
- **Single user/session revocation** doesn't need rotation: password reset and
  account deletion bump the user's `tokenVersion`, which kills all of that
  user's outstanding sessions.
- **API keys / SMTP / backend Sentry DSN**: update `docker/.env` on the host,
  then recreate the backend container. Frontend build-time variables such as
  `VITE_SENTRY_DSN` live in Cloudflare Pages.
- **Postgres password**: change the `ramsey` database role password first,
  update `POSTGRES_PASSWORD` in `docker/.env`, then recreate the backend and
  backup services. Editing only the env file does not change an existing
  database role.

## Backups

All durable state is in Postgres (users, projects, diagrams + Yjs state,
snapshots, analysis jobs/results, audit log, chat-usage ledger, pg-boss
queue). Redis holds only transient rate-limit counters — safe to lose.

- The `db-backup` service runs a daily `pg_dump` into the `dbbackups` volume,
  retaining seven daily, four weekly, and three monthly generations.
- The optional `backup-offsite` service mirrors that volume to Cloudflare R2
  once all four `R2_*` variables are configured; otherwise it stays idle.
- Verify restores periodically into a scratch database, then run
  `npm run test:integration` against it.
- The privacy policy's retention statements must match whatever backup
  retention you choose.

## Health & monitoring

- Liveness: `GET /api/health` (exempt from rate limiting).
- Readiness: `GET /api/health/ready` checks Postgres and is suitable for host
  and tunnel monitoring.
- Errors: set `SENTRY_DSN` (backend) and `VITE_SENTRY_DSN` (frontend build);
  both are no-ops without a DSN.
- Logs: pino JSON on stdout in production; secrets/cookies are redacted by
  the logger config.

## Test matrix

| Command                                                | What it covers                                                  | Needs                                               |
| ------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------- |
| `npx vitest run`                                       | engine + backend unit/API + frontend unit (428 tests)           | DB only for the integration project                 |
| `npm run test:e2e`                                     | real-browser journeys (auth lifecycle, diagram DnD, guest mode) | dev Postgres running; boots backend+frontend itself |
| `npm run lint` / `npm run typecheck` / `npm run build` | static gates                                                    | —                                                   |
