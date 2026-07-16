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
| `ANTHROPIC_API_KEY`                                                 | no       | —                        | AI chat; the endpoint degrades gracefully when unset                                                              |
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
`GET /api/capabilities` reports `{ aiChat, serverAnalysis }`; the UI drops the
AI Chat tab when `ANTHROPIC_API_KEY` is unset and the "Run on server" toggle
when the analysis queue isn't running (client-side analysis still works). A
minimal cheap deployment is therefore: no API key, no solver-worker container.

## Deploy

Production uses Cloudflare Pages plus AWS ECS Fargate. Follow
[`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md) for the exact first-deploy order.

The Compose stack remains the local/self-hosted path:

```bash
# Build images and start the prod stack (frontend, backend, solver-worker,
# postgres, redis):
cp docker/.env.prod.example docker/.env.prod   # fill in real values
docker compose --env-file docker/.env.prod \
  -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d
```

- **Migrations run automatically**: the backend container executes
  `prisma migrate deploy` on start (the worker overrides its command, so only
  the backend applies them — no race). Manual equivalent:
  `npm run db:migrate:deploy -w packages/backend`.
- **The solver-worker must be running** for server-side analysis: jobs are
  queued in Postgres (pg-boss) and a dead worker means jobs sit in `QUEUED`.
  It is a normal compose service — supervise/restart it like the API.
  The worker also runs daily housekeeping (`chat_usage` retention pruning,
  03:00 UTC).

## Secret rotation

- **`JWT_SECRET`**: rotating it invalidates _every_ session immediately (all
  tokens fail signature verification); users just log in again. Safe to rotate
  any time; prefer a low-traffic window.
- **Single user/session revocation** doesn't need rotation: password reset and
  account deletion bump the user's `tokenVersion`, which kills all of that
  user's outstanding sessions.
- **`ANTHROPIC_API_KEY` / SMTP / Sentry DSN**: on AWS, edit the matching key in
  `ramsey/production/application` and force a new API deployment. For Compose,
  replace the env value and restart.
- **Postgres password**: on AWS, change the RDS master password and the
  `password` field in `ramsey/production/database`, then force new API and
  worker deployments. For Compose, update `DATABASE_URL` and
  `POSTGRES_PASSWORD`, then restart both services.

## Backups

All durable state is in Postgres (users, projects, diagrams + Yjs state,
snapshots, analysis jobs/results, audit log, chat-usage ledger, pg-boss
queue). Redis holds only transient rate-limit counters — safe to lose.

- AWS RDS keeps seven days of automated backups and takes a final snapshot on
  removal. For Compose, run a nightly `pg_dump` retained per your policy.
- Verify restores periodically into a scratch database, then run
  `npm run test:integration` against it.
- The privacy policy's retention statements must match whatever backup
  retention you choose.

## Health & monitoring

- Liveness: `GET /api/health` (exempt from rate limiting).
- Readiness: `GET /api/health/ready` checks Postgres and backs the AWS load
  balancer health check.
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
