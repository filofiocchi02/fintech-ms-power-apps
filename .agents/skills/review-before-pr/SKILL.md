---
name: review-before-pr
description: Self-review a branch against its issue, audit the diff for authorization, source-of-truth and audit gaps, run npm run check, and open or update the PR with real evidence.
argument-hint: <issue-number>
triggers:
  - user
---

# Review before PR

`$1` is the issue number. Last gate before a human and Devin Review spend time on this branch.

**Evidence before claims.** If you have not run a command in this session, you cannot say it
passes. "Should pass", "looks correct" and "I'm confident" are not results. Run it, read the
full output, check the exit code, then state what you observed.

## Step 1 — Scope check

```bash
gh issue view $1
git diff main...HEAD --stat
```

Compare the changed files against the issue's **Owned paths**. Anything outside them is a
merge conflict waiting for the integration session.

- Shared code changed from a feature branch → revert it, or justify it explicitly in the PR
  under Architecture and security notes.
- Another feature's paths touched → revert. That work belongs to that session.
- Out-of-scope work crept in → remove it, or split it out and note it as deferred.

## Step 2 — Read the whole diff

```bash
git diff main...HEAD
```

Read it. Not the summary — the diff. Check for each of these deliberately:

**Authorization**
- Every new page and every new route handler enforces app access server-side.
- Every sensitive action enforces its own permission, independently of page access.
- No check that exists only in React, and none that trusts a client-supplied role, id or
  amount.

**Source of truth**
- Payments/ledger, KYC-provider evidence and flag values/history are read and written through
  their connectors — not reimplemented, and not treated as advisory.
- **No external authoritative state landed in SQLite.** Inspect every new column and every
  insert: provider risk scores, balances, flag values and payment history must not be stored.
  This is the most damaging and most easily missed regression in this repository.
- App-owned workflow state goes through `WorkflowRepository`; audit goes through `AuditSink`.

**Correctness**
- Financial invariants: amount cannot exceed the refundable balance; approval thresholds
  enforced server-side; nothing executes payment before approval.
- Idempotency: a replayed key cannot pay twice or create a second case. Check the unique
  constraint *and* the connector call using the same key.
- Zod validation on every request body and query parameter, with typed errors and no stack
  traces or internal messages reaching the UI.

**Audit**
- Every accepted app-owned mutation writes an `AuditEvent` with actor, action, time, reason and
  before/after.
- Denied and failed attempts never write an `ACCEPTED` outcome.

**Data and migrations**
- Schema change has a generated, committed migration in `drizzle/`, and it applies to an
  existing database rather than only to a fresh one.
- Seed still deterministic and idempotent; it does not overwrite real decisions.
- No fixture imported into a page, component or route handler.

**Secrets and hygiene**
- No credentials, tokens or real customer data. No `.db` file staged. No PII in logs.
- No stray debugging code, no commented-out blocks, no unrelated formatting churn.

## Step 3 — Run the gate

```bash
npm run check
```

Fix what fails and run it again until it is green. Do not open the PR on a red gate and do not
disable a lint rule, weaken a type, or delete a failing assertion to get past it — if a test is
genuinely wrong, say so explicitly in the PR.

## Step 4 — Open or update the PR

Push the branch, then create the PR against `main` using
`.github/pull_request_template.md`, filling every section with specifics:

```bash
git push -u origin HEAD
gh pr create --fill-first --base main   # then edit the body to the template
```

The body must contain:

- **`Closes #$1`** on the first line.
- **Summary** — what changed and the notable decisions.
- **Architecture and security notes** — which server checks cover the new surfaces, which
  connector or repository owns each piece of data, confirmation that no external authoritative
  state was copied into SQLite, and where invariants, idempotency and audit are enforced.
- **Checks run** — the exact commands and their observed results.
- **Negative paths verified** — each forbidden request actually attempted, including direct
  URL and direct API calls, with the observed result and confirmation that nothing mutated and
  no success audit was written.
- **Visual evidence** — 1280px screenshots or a recording, plus the 375px smoke check.
- **Limitations** — untested paths, deferred P1 work, known gaps. Be specific; a reviewer
  trusting a vague "fully tested" is worse than a listed gap.

If the PR already exists, update the body rather than opening a second one:
`gh pr edit --body-file <file>`.

Never claim a check, a screenshot or a negative path that you did not actually produce.

## Step 5 — Hand off

- Return to `github-issue-lifecycle` for the label move to `status:in-review` and the issue
  comment.
- Leave the branch in place; PR feedback gets fixed on it.
- Do not merge your own PR past a failing check or an unresolved blocking review finding, and
  do not push to `main`.

## Provenance

Adapted from the evidence-before-completion, diff-review, branch-finish and PR-handoff ideas in
`obra/superpowers` (MIT) — specifically `verification-before-completion`,
`requesting-code-review` and `finishing-a-development-branch`. Its subagent-dispatch workflow,
worktree management and interactive option menus are intentionally not imported. See
`.agents/skills/README.md`.
