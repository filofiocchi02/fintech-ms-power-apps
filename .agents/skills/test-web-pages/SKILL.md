---
name: test-web-pages
description: Browser-verify a change against its issue using TypeScript Playwright, exercising negative authorization paths, console errors, responsive widths and restart persistence, and capturing evidence.
argument-hint: <issue-number>
triggers:
  - user
---

# Test web pages

`$1` is the issue number. A passing unit suite is not evidence that a tool works. This skill
produces the evidence a reviewer can check.

Use the repository's TypeScript Playwright stack (`npm run test:e2e`, specs in `e2e/`). Do not
add Python, and do not add a second browser-testing framework.

**Tests never run against the developer demo database.** `playwright.config.ts` points e2e at
its own `INTERNAL_TOOLS_DB_PATH`; unit tests use `createTestDb()` from
`src/tests/helpers/db.ts`. If you need a clean slate, delete the e2e database file and re-run
migrations and seed — never mutate `./data/internal-tools.db` from a test.

## Step 1 — Work out what must be proven

1. `gh issue view $1` and read the acceptance criteria. Every criterion phrased as a denial,
   limit, duplicate or approval requirement is a test you owe.
2. `git diff main...HEAD --stat` then read the diff. New route or page → new authorization
   test. New mutation → idempotency and audit tests.
3. Write the list explicitly before testing: the changed happy path, then every negative
   authorization path and every business-rule violation named in the issue. Test the negatives;
   they are where this experiment either earns or loses trust.

## Step 2 — Start the app and do reconnaissance

```bash
npm run db:migrate && npm run db:seed   # only against a scratch DB path
npm run dev
```

Then, before writing selectors, look at the rendered page — this app is dynamic, so reading
the source tells you little:

- navigate, wait for the network to settle, screenshot, and inspect the live DOM
- derive selectors from what actually rendered

Prefer role- and text-based locators (`getByRole`, `getByLabel`, `getByRole('button', { name })`)
over brittle CSS chains; they double as an accessibility check, because a control with no
accessible name cannot be located this way.

## Step 3 — Exercise the paths

Happy path: drive the real workflow through the UI as the role that is allowed to do it, and
assert the *outcome* — the state changed, the audit row exists, the value the connector now
returns — not just that a toast appeared.

Negative paths, for each role that must be refused:

- **Direct page URL** while signed in as the forbidden role → refused, no data rendered.
- **Direct API call** (`request.post(...)` / `request.get(...)`), bypassing the UI entirely →
  refused status, typed error, no stack trace. This is the test that catches UI-only security.
- **Forbidden action on a permitted page** → refused independently of page access.
- **Business-rule violations** from the issue: over-limit amounts, replayed idempotency keys,
  approval thresholds, production writes without the required role or confirmation.

For every refusal, assert two things beyond the status code:

1. **Nothing mutated.** Re-read the workflow row or the connector state.
2. **No success audit.** No `ACCEPTED` audit row for that attempt.

## Step 4 — Browser quality checks

- Collect `console` errors and `pageerror` events across the run and assert the list is empty.
  A console error in a financial tool is a defect, not noise.
- Check **1280px** (primary) and **375px** (smoke). At 375px: nothing clipped or overlapping,
  no horizontal scroll, actions still reachable.
- Tab through each new view: focus visible, order sensible, dialogs trap and restore focus.

## Step 5 — Restart persistence

For any change to workflow state or audit — this is the Dataverse replacement claim, so prove
it rather than assuming SQLite worked:

1. Perform a mutation.
2. Stop the server completely.
3. Start it again.
4. Re-read the record and the audit timeline in the browser. Both must still be there and
   unchanged.

## Step 6 — Run the suite and capture evidence

```bash
npx playwright test e2e/<changed-area>.spec.ts   # focused, while iterating
npm run test:e2e                                # full run before handing off
```

Capture and keep:

- screenshots of each new or changed view at 1280px, plus the 375px smoke shot
- a screenshot or short recording of one refused attempt
- a screenshot of the audit timeline after a mutation
- the exact commands run and their results

Report failures as failures. If a criterion could not be verified, say which one and why —
never describe an untested path as working. Then run `review-before-pr` with the same issue
number.

## Provenance

The reconnaissance-then-action loop and the "wait for the page to settle before inspecting"
discipline are adapted from Anthropic's `webapp-testing` skill (Apache-2.0); its Python
Playwright and helper-script assumptions are replaced with this repository's TypeScript
stack. See `.agents/skills/README.md`.
