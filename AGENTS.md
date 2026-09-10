<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Internal Tools — agent instructions

Bespoke internal-tools prototype for a Series C fintech, built to test whether Devin can
replace a ~$250k/year Microsoft Power Apps footprint with secure custom software. Three real
workflows — KYC review queue, refunds dashboard, feature-flag admin — inside one role-aware
frontend, with at least 10 more internal apps expected after them.

The interesting output of this repository is not UI polish. It is evidence about build
velocity, reuse across apps, correctness under adversarial use, review effort, and the new
operational ownership the company takes on by leaving a managed platform. Write code that
makes that evidence honest.

## Non-negotiable rules

These are not style preferences. A change that breaks one of them is wrong even if it passes
CI, and should be rejected in review.

### Architecture

- **One Next.js application and one deployable**, containing the React UI and a thin Route
  Handler BFF. No separate backend service, no second frontend.
- **Full Power Platform exit.** No Dataverse dependency, and no Power Platform SDK, connector
  or runtime anywhere in the target architecture. Entra ID or an equivalent corporate IdP may
  remain independently, but the prototype authenticates with a server-readable demo role
  cookie plus a RoleSwitcher, not a real tenant.
- **Never import fixture data directly into React pages/components or Route Handlers.**
  Server routes go through the connector and repository interfaces. A fixture import in a
  page, component or route handler is a bug: it hides the real integration boundary and makes
  the reuse and effort measurements lie.

### Source-of-truth boundaries

- External authoritative data stays behind `CustomerConnector`, `KycProviderConnector`,
  `PaymentsConnector` and `FeatureFlagConnector`. These are server-only interfaces with
  realistic mock implementations.
- Internal-tool audit writes go through `AuditSink`.
- **App-owned `KycCase` and `RefundCase` workflow state goes through `WorkflowRepository`
  only.** The prototype implementation is Drizzle + SQLite at `./data/internal-tools.db`;
  production swaps it for PostgreSQL / Azure SQL. Nothing above the repository knows which.
- **Never copy authoritative payment, KYC-provider or flag state into that database.** Store
  references (`providerCaseRef`, `paymentRef`, `customerRef`) and compose the authoritative
  fields at read time from the connector. Mirroring provider risk scores, ledger balances or
  flag values into SQLite is the single easiest way to build a fake, and it silently recreates
  the Dataverse coupling this project exists to remove.
- Internal-tool `AuditEvent` rows persist in the same SQLite database through `AuditSink`.
  This does **not** replace financial history in `PaymentsConnector` or authoritative change
  history in `FeatureFlagConnector`. App audit and domain history are separate, and the UI
  should show them as separate.

### Security

- **React visibility is UX, not authorization.** Hidden tabs and hidden buttons are a
  courtesy to the operator, never a security boundary.
- Protect **every** app page and API server-side with app-access capabilities, and protect
  sensitive actions **independently** of page access. A user who can open a page is not
  thereby allowed to act on it.
- A direct forbidden page, API or action request must fail **without mutation and without a
  false success audit**. Denials may be audited, but only as denials.
- Keep financial invariants and idempotency in `PaymentsConnector`. Keep authoritative flag
  semantics and history in `FeatureFlagConnector`. Keep KYC invariants in the trusted
  KYC/backend layer where available. Enforcement belongs at the lowest trusted layer, not in
  the route handler that happens to be convenient, and never in the browser.
- **Every accepted app-owned mutation emits the common `AuditEvent`.** Rejected mutations do
  not claim success — not in the response, not in the UI, not in audit.
- Validate all input with **Zod** and return **typed errors**. Never expose stack traces or
  internal messages to the UI.
- No secrets in the repository. No logging of PII or full payment identifiers.

### UI style

Compact, desktop-first fintech operations console:

- Neutral palette; semantic colour reserved for status, risk and environment badges so those
  read at a glance.
- Clear information hierarchy, dense tables, accessible labels and visible focus states.
- Explicit confirmation for destructive and financial actions — for production flag writes,
  a typed flag-key confirmation plus a reason.
- Responsive enough to pass a 375px smoke check.
- No gradients, no decorative landing-page sections, no marketing copy.

### Workflow

- Run `npm run check` before every PR (lint, typecheck, unit tests, build).
- Link every PR to its GitHub issue with `Closes #N`, and fill in
  `.github/pull_request_template.md` honestly.
- **Do not push to `main`.** Branch, PR, and let review and CI gate the merge.
- Issue tracking uses `gh issue` and repository labels only. This project deliberately does
  **not** use a GitHub Project; do not create or depend on one.
- Cut P1 polish before weakening server authorization, domain invariants, idempotency,
  approval behaviour, persistence, audit or tests. Those are the experiment.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit/component tests (`src/**/*.test.ts(x)`) |
| `npm run test:e2e` | Playwright browser tests (`e2e/`) |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Apply migrations, then the deterministic idempotent seed |
| `npm run build` | Production build |
| `npm run check` | lint + typecheck + unit tests + build. The PR gate. |

Notes:

- The database file is git-ignored; the schema, the generated migrations in `drizzle/` and the
  seed code are tracked. Changing `src/db/schema.ts` means running `npm run db:generate` and
  committing the migration.
- Tests must never use the developer demo database. Use `createTestDb()` from
  `src/tests/helpers/db.ts`, which migrates an isolated temp database per test.
- The seed must stay deterministic (fixed ids and timestamps, no `Date.now()`, no randomness)
  and idempotent (re-running never duplicates rows or overwrites a real decision).

## Repository layout

```
src/app/                  Pages and Route Handler BFF (kyc/, refunds/, flags/, api/)
src/features/<app>/        Per-tool server logic, schemas and components
src/components/            Shared operations-console shell and primitives
src/lib/auth/              Roles, capabilities, protected page/API helpers
src/lib/integrations/      Connector interfaces + mock/ implementations (server-only)
src/db/                    Drizzle schema, client, migrate and seed
drizzle/                   Generated migrations (tracked)
src/tests/                 Vitest unit/component tests and shared helpers
e2e/                       Playwright browser tests
.agents/skills/            Repository skills (see below)
```

Feature sessions own only their listed paths. Changing shared code from a feature branch
causes merge conflicts in integration; if shared code genuinely must change, say so in the PR.

## Frozen shared contracts

The following files and types are frozen by the foundation issue (#1). Feature sessions
import and consume them; they do not reimplement or extend them from a feature branch without
an explicit PR note and a shared review.

- `src/lib/auth/roles.ts` — `Role`, `App`, `AppAction`, `ROLE_APP_ACCESS`, `ROLE_ACTIONS`
- `src/lib/auth/session.ts` — `getCurrentUser()`, `roleCookieOptions()`
- `src/lib/auth/guards.ts` — `requireAppAccess()`, `requireApiAppAccess()`, `requireActionPermission()`
- `src/lib/errors/errors.ts` — `AppError`, error constructors, `isAppError()`
- `src/lib/validation/api.ts` — `ApiResponse<T>`, `successResponse()`, `errorResponse()`
- `src/lib/validation/zod.ts` — shared Zod schemas and `parseOrAppError()`
- `src/lib/integrations/types.ts` — `CustomerConnector`, `KycProviderConnector`, `PaymentsConnector`, `FeatureFlagConnector`
- `src/lib/repositories/types.ts` — `WorkflowRepository`, `AuditSink`, `KycCaseUpdate`, `RefundCaseUpdate`, `OptimisticConcurrencyError`
- `src/db/schema.ts` — `auditEvents`, `kycCaseWorkflow`, `refundCaseWorkflow`, status/outcome/app unions
- `src/db/client.ts` — `createDb()`, `closeDb()`, `getDb()`, `AppDatabase`
- `src/components/internal-tools/**` — shared shell, tables, filters, detail layouts, badges, confirmations, states

If a feature session needs to change one of these, pause and ask. Changing a frozen
interface means every downstream branch has to rebase.

## Skills

Repository skills live in `.agents/skills/`. Each takes an issue number as `$1`:

| Skill | Use |
| --- | --- |
| `github-issue-lifecycle` | Claim an issue, branch, move status labels, hand off at PR and merge |
| `frontend-design` | Build or change operations-console UI |
| `test-web-pages` | Browser-verify a change and capture evidence |
| `review-before-pr` | Self-review, run the gate, open or update the PR |

**Invoke these skills sequentially, one at a time.** Invoking the next skill replaces the
currently active skill, so a session runs `github-issue-lifecycle` → `frontend-design` →
`test-web-pages` → `review-before-pr` → back to `github-issue-lifecycle` for the PR and merge
steps, rather than trying to hold several at once. Finish the work a skill asks for before
moving on.

Provenance and licensing for the skills adapted from open-source sources is recorded in
`.agents/skills/README.md`.
