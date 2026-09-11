# fintech-ms-power-apps

Internal-tools prototype for a Series C fintech, evaluating a full Microsoft Power Apps /
Power Platform exit. Three real workflows — **KYC review queue**, **refunds dashboard** and
**feature-flag admin** — inside one role-aware Next.js application, with at least 10 more
internal apps expected to follow.

The question this repository exists to answer is not "can we build a nice UI". It is whether
bespoke internal tools can be built fast enough, safely enough and reusably enough to justify
giving up a managed platform's data, security, workflow, audit, hosting and governance
capabilities.

> **Read [`AGENTS.md`](./AGENTS.md) before changing anything.** It holds the non-negotiable
> architecture and security rules, and is the specification the issues are written against.

## Prerequisites

- **Node.js 22** — the version CI runs (`.github/workflows/quality.yml`). Newer versions
  generally work but are untested.
- **A native build toolchain** — `better-sqlite3` ships prebuilt binaries for common
  Node/platform combinations. Where no prebuilt exists, `npm ci` compiles from source via
  node-gyp, which needs python3 plus a C++ toolchain (`xcode-select --install` on macOS,
  `build-essential` on Debian/Ubuntu).
- **Playwright browsers — e2e only** — `npx playwright install chromium`, once per machine.
  On Linux add `--with-deps` to pull the system libraries Chromium needs.

## Getting started

```bash
npm ci
npm run dev:clean   # rebuild ./data/internal-tools.db from migrations + seed, then next dev
```

Open http://localhost:3000. There is no login form: the RoleSwitcher in the shell picks
which demo user the server acts as, set as a signed httpOnly cookie (see
`DEMO_ROLE_SECRET` below). The seed is deterministic and idempotent —
`npm run db:reset` always returns to the same demo state.

| Demo user | Role | Can open | Can do |
| --- | --- | --- | --- |
| Sam Whitfield | Support Agent | Refunds | read payments, request refunds |
| Casey Nwosu / Dana Reyes | Compliance Analyst | KYC | read, assign and decide cases |
| Riley Park | Release Engineer | Flags | read and write flags |
| Morgan Hale | Manager / Admin | All apps + platform | every action, incl. refund approve/execute |

Page access and action permission are separate on purpose: calling an action API as a role
that can open the page but lacks the action fails closed, with no mutation and no false
success audit.

## Environment variables

Nothing is required for `npm run dev` or `npm run test:e2e`. `.env*` files are gitignored;
Next.js loads `.env.local` automatically if you create one.

| Variable | Required when | Purpose |
| --- | --- | --- |
| `DEMO_ROLE_SECRET` | `npm start`, or any `NODE_ENV=production` run | HMAC key that signs the `demo-user` cookie. Dev falls back to a hardcoded dev-only value; e2e injects its own. Without it, production-mode sign-in throws. |
| `INTERNAL_TOOLS_DB_PATH` | never — defaults to `./data/internal-tools.db` | Overrides the database file. Unit tests and e2e use this to stay off the demo database. |
| `INTERNAL_TOOLS_ENV` | never | Label shown on the environment badge in the shell. |
| `E2E_PORT` | e2e port conflicts | Port the e2e suite serves on. Default 3100. |

Example production-mode run:

```bash
npm run build
DEMO_ROLE_SECRET=$(openssl rand -base64 32) npm start
```

Rotating the secret invalidates every signed cookie — all sessions are silently signed out,
which is the correct behaviour for a demo identity mechanism.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (requires an existing seeded DB — see `dev:clean`) |
| `npm run dev:clean` | `db:reset`, then the development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Next route typegen + `tsc --noEmit` |
| `npm test` | Vitest unit/component tests |
| `npm run test:e2e` | Playwright browser tests (needs `npx playwright install chromium` first) |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Migrate, then seed |
| `npm run db:reset` | Drop the demo database, rebuild from migrations + seed |
| `npm run build` | Production build |
| `npm start` | Serve the production build (requires `DEMO_ROLE_SECRET`) |
| `npm run check` | lint + typecheck + unit tests + build — the PR gate, and what CI runs |

## Verifying a fresh checkout

```bash
npm ci
npm run check                       # identical to the CI job
npx playwright install chromium     # one-time per machine
npm run test:e2e                    # builds, serves on :3100, tests against ./data/e2e.db
```

When Playwright launches the suite server, e2e uses its own database:
`e2e/global-setup.ts` rebuilds `./data/e2e.db` from migrations + seed, and the launched
server runs with its own `INTERNAL_TOOLS_DB_PATH` and `DEMO_ROLE_SECRET`. That isolation
only holds for a server Playwright starts — locally, `reuseExistingServer` attaches to
whatever already answers on `E2E_PORT`, including a dev server pointed at the demo
database. Make sure port 3100 is free, or belongs to a server started by a previous e2e
run, before running the suite.

## Architecture in one paragraph

One Next.js App Router deployable holds the React UI and a thin Route Handler BFF. External
authoritative data stays behind server-only connectors (`CustomerConnector`,
`KycProviderConnector`, `PaymentsConnector`, `FeatureFlagConnector`) with realistic mocks —
payments, KYC-provider evidence and flag values are never copied into local storage.
App-owned workflow state and internal-tool audit are the Dataverse replacement, held behind
`WorkflowRepository` and `AuditSink` and implemented for the prototype with Drizzle + SQLite
at `./data/internal-tools.db` (production swaps in PostgreSQL/Azure SQL and a durable audit
platform). Authorization is enforced server-side per page, per API and per action; hidden UI
is a convenience, never the boundary.

## Working on an issue

Work is tracked as GitHub issues (`priority:*` and `status:*` labels, no GitHub Project).
Repository skills in [`.agents/skills/`](./.agents/skills/README.md) drive each session and
are invoked **one at a time, in sequence**:

`/github-issue-lifecycle <n>` → `/frontend-design <n>` → `/test-web-pages <n>` →
`/review-before-pr <n>` → back to `/github-issue-lifecycle <n>`

The database file is git-ignored; the schema, generated migrations and seed code are tracked.
Tests always run against an isolated database, never the demo one.
