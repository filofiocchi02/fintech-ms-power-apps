---
name: github-issue-lifecycle
description: Claim a repository issue, branch from it, move its status labels, and hand it off at PR and merge time using gh issue only.
argument-hint: <issue-number>
triggers:
  - user
---

# GitHub issue lifecycle

Keeps issue state honest for a multi-session prototype where several Devin sessions work in
parallel. `$1` is the issue number. If no number was given, list open issues with
`gh issue list --label status:todo` and ask which one before doing anything else.

Use `gh issue` and `gh pr` only. This project has no GitHub Project — never run `gh project`
commands, and never run `gh repo create` or `gh repo fork`.

## Phase 1 — Start work

Run this before writing any code.

1. Confirm you are in the right repository. `gh repo view --json nameWithOwner` must match the
   `origin` remote in `git remote -v`. On a mismatch, stop and report it.
2. Read the issue and its comments:
   ```bash
   gh issue view $1 --comments
   ```
   Read `AGENTS.md` too. The issue's Owned paths and Out of scope sections are binding.
3. **Verify dependencies are closed.** Every issue this one lists under Dependencies (or as
   "Blocked by #N") must be closed:
   ```bash
   gh issue view <dep> --json number,state,title
   ```
   If a dependency is still open, stop and report which one blocks you. Do not start the work
   and do not begin by re-implementing the dependency.
4. Claim it, so a parallel session does not pick up the same issue:
   ```bash
   gh issue edit $1 --add-assignee @me
   gh issue edit $1 --remove-label status:todo --add-label status:in-progress
   ```
   If it is already assigned to someone else or already `status:in-progress`, stop and ask.
5. Branch from up-to-date `main`, naming it from the issue:
   ```bash
   git switch main && git pull
   git switch -c <type>/<issue-number>-<short-slug>
   ```
   Use `feat/` for the three tools and the foundation, `chore/` for tooling, `test/` for QA,
   `fix/` for defects — e.g. `feat/2-kyc-review-queue`.
6. Post a one-line comment saying you have started and on which branch.

Then leave this skill and do the work (`frontend-design`, then `test-web-pages`).

## Phase 2 — PR time

After `review-before-pr` has opened the PR:

```bash
gh issue edit $1 --remove-label status:in-progress --add-label status:in-review
gh issue comment $1 --body "PR: <url>"
```

The PR body must contain `Closes #$1` so the merge closes the issue automatically. Verify it
does: `gh pr view --json body,closingIssuesReferences`.

## Phase 3 — Merge time

Only after the PR is actually merged.

1. Confirm checks passed and the PR merged:
   ```bash
   gh pr view <pr> --json state,mergedAt,statusCheckRollup
   ```
2. Confirm the merge closed the issue: `gh issue view $1 --json state,stateReason`. If it is
   still open, the PR was missing `Closes #$1` — say so, then close it referencing the merged
   PR rather than silently.
3. Remove any remaining status label:
   ```bash
   gh issue edit $1 --remove-label status:in-review
   ```
4. Leave a concise completion comment: what shipped, what was deliberately deferred, and the
   evidence (checks run, negative paths verified). Two to five lines. No restating the diff.

## Rules

- **Never close an issue before its PR merges.** An open PR with a closed issue makes the
  board lie to every other session.
- **Never silently change scope.** If the issue's acceptance criteria turn out to be wrong,
  impossible, or bigger than stated, comment on the issue explaining what and why, and let a
  human decide. Do not quietly drop a checkbox or quietly add work.
- Only create a sub-issue when the work is independently assignable to another session, needs
  its own PR, or is intentionally deferred. State that reason in a comment first. Ordinary
  implementation steps belong in the acceptance-criteria checklist, not in sub-issues.
- Tick acceptance-criteria checkboxes only for things you have actually verified.
