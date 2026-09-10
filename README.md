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

## Getting started

```bash
npm ci
npm run db:seed     # applies migrations, then the deterministic demo seed
npm run dev
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Next route typegen + `tsc --noEmit` |
| `npm test` | Vitest unit/component tests |
| `npm run test:e2e` | Playwright browser tests |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Migrate, then seed |
| `npm run build` | Production build |
| `npm run check` | lint + typecheck + unit tests + build — the PR gate, and what CI runs |

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
