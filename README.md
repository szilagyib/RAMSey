# RAMSey

A modern, web-based, collaborative tool for creating, analyzing, and exporting RAMS (Reliability, Availability, Maintainability, Safety) diagrams.

RAMSey replaces legacy desktop tools with a real-time collaborative environment featuring AI-assisted diagram editing, integrated analysis solvers, and publication-quality LaTeX/TikZ export.

## Features

### Diagram Types
- **Markov Chains** — State-transition diagrams with validation
- **Fault Tree Analysis (FTA)** — Logic gates, minimal cut sets, importance measures
- **Event Tree Analysis (ETA)** — Branching outcome probability analysis
- **Reliability Block Diagrams (RBD)** — Series / parallel / k-out-of-n and general (non-series-parallel) networks
- **Bow-Tie Diagrams** — Combined FTA + ETA with barrier management
- **FMEA** — Tabular failure mode analysis with RPN scoring

### Integrated Analysis Engine
Analysis is implemented for all five graph diagram types, in a shared engine package, with results that carry provenance (solver name/version, method, numeric metadata, assumptions, warnings):
- **Markov** — steady-state, transient, availability, reliability, MTTF, MTBF/MTTR, failure frequency, sensitivity
- **Fault tree** — minimal cut sets (MOCUS), top-event probability (exact inclusion–exclusion), importance measures (Birnbaum, Fussell-Vesely, RAW, RRW), Monte Carlo, beta-factor common-cause
- **RBD** — reliability/availability over any two-terminal network (minimal path sets + inclusion–exclusion), sensitivity, Monte Carlo
- **Event tree** — consequence probabilities
- **Bow-tie** — top-event and consequence probabilities via barrier propagation
- **Hybrid execution** — small models run client-side in a Web Worker; analyses can also be queued and computed by a server-side solver worker, with results persisted

### Real-Time Collaboration
- Multi-user simultaneous editing via Yjs (CRDT)
- Live cursors and selection awareness
- Server-persisted shared state; version history with named snapshots
- Guest mode works locally (browser storage) without an account

### AI Assistance
- Natural-language diagram editing via tool-calling (add/remove/update nodes and edges)
- Context-aware Q&A about the current model
- Integrated chat panel

### Export
- **LaTeX/TikZ** — compilable standalone document, publication-ready
- **SVG** — scalable vector graphics
- **PNG / JPEG** — configurable resolution
- **JSON** — raw diagram data

### Projects & Teams
- Project-based organization with multiple diagrams per project
- Team workspaces with role-based access (admin / member)
- Per-project sharing with owner / editor / viewer roles
- Link sharing (anyone with the link)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, React Flow, Zustand, Tailwind CSS |
| Backend | Node.js, Fastify, TypeScript, Prisma |
| Database | PostgreSQL |
| Cache & queue | Redis (shared rate-limit counters), pg-boss (Postgres-backed analysis job queue) |
| Collaboration | Yjs, y-websocket (custom Fastify sync server) |
| Auth | JWT sessions (httpOnly cookie) + Google OAuth |
| AI | Anthropic SDK (Claude) with tool calling |
| Analysis | Shared `@ramsey/engine` package (client Web Worker + server solver worker) |
| Export | html-to-image, custom TikZ serializers |
| Infrastructure | Docker, Docker Compose, GitHub Actions |

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22.12+ (required by Vite 8)
- Docker & Docker Compose
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/szilagyib/RAMSey.git
cd RAMSey

# Copy environment variables
cp .env.example .env

# Start services
docker compose up -d

# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start development (backend + frontend)
npm run dev
```

### Testing

```bash
npx vitest run        # engine + backend unit/API + frontend unit tests
npm run test:e2e      # Playwright browser journeys (needs the dev Postgres up)
npm run lint          # eslint (flat config)
npm run typecheck     # tsc across all workspaces
```

### Try an example

Open any diagram, then **File → Import JSON…** and pick
[`examples/markov-redundant-power.json`](examples/markov-redundant-power.json) —
a repairable redundant-PSU Markov model (all four state types, λ/μ/β rates,
an absorbing blackout state) ready for steady-state, transient, and MTTF analysis.

### Environment Variables

See [`.env.example`](.env.example) for development configuration and
[`docs/OPERATIONS.md`](docs/OPERATIONS.md) for the full operator reference
(every variable, defaults, AI budgets, secret rotation, backups).

## Project Structure

```
RAMSey/
├── packages/
│   ├── frontend/          # Vite + React SPA
│   ├── backend/           # Fastify API + Yjs collab server + solver worker + auth
│   └── engine/            # Shared analysis engine (ModelIR, solvers)
├── docker/                # Dockerfiles + compose (incl. solver-worker service)
├── docs/                  # Deployment guide (OPERATIONS.md)
├── examples/              # Importable example diagrams
└── e2e/                   # Playwright end-to-end tests
```

## Architecture

```
Browser (Vite SPA)
  ├── React Flow canvas (diagram editing)
  ├── Zustand (state management)
  ├── Yjs (CRDT real-time sync) + awareness (cursors/selection)
  ├── AI Chat Panel (Anthropic SDK, tool calling)
  └── Client analysis (Web Worker, @ramsey/engine)
          │
          │ WebSocket + REST
          ▼
Server
  ├── Fastify API (orchestrator, rate-limited)
  ├── Yjs WebSocket sync server (collaboration + persistence)
  ├── JWT sessions + Google OAuth, teams & project sharing
  ├── pg-boss job queue (Postgres) → solver worker (separate process, @ramsey/engine)
  ├── PostgreSQL (data, audit log, snapshots, analysis results)
  └── Redis (shared rate-limit counters; fails open when down)
```

Architectural principle: **the API server doesn't perform heavy computation**. Server-side analysis runs in an isolated solver-worker process via the job queue.

## Known limitations

- **PDF export** is not implemented (LaTeX/TikZ, SVG, PNG, JPEG, JSON are).
- **OAuth** is Google only.
- **FMEA** computes RPN but not criticality classification.
- Guest mode is local-only (no offline-first sync).
- Fault-tree probabilities use **MOCUS + inclusion–exclusion** (exact for typical sizes), not BDD.
- Optional features (AI assistant, server-side analysis) hide themselves when the deployment doesn't configure them.

## Self-hosting

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for the deployment guide:
environment variables, Docker Compose setup, migrations, backups, and
monitoring. A minimal deployment is a single small VPS.

## License

[MIT](LICENSE)
