# Repository skills

Project skills for this prototype. Each is invoked with an issue number, e.g.
`/github-issue-lifecycle 2`.

| Skill | Purpose |
| --- | --- |
| `github-issue-lifecycle` | Claim an issue, branch, move status labels, hand off at PR and merge |
| `frontend-design` | Build or change operations-console UI |
| `test-web-pages` | Browser-verify a change and capture evidence |
| `review-before-pr` | Self-review, run `npm run check`, open or update the PR |

**Invoke them one at a time, in sequence.** Invoking a skill replaces the currently active
one, so a session runs `github-issue-lifecycle` → `frontend-design` → `test-web-pages` →
`review-before-pr`, then returns to `github-issue-lifecycle` for the PR and merge phases.

---

## Provenance and licensing

Upstream sources were inspected at the commits below. Nothing was installed wholesale: no
upstream repository, plugin or helper script is vendored. Guidance was condensed and rewritten
for this repository's stack (npm, TypeScript, Next.js App Router, Vitest, Playwright, Drizzle +
SQLite), and instructions depending on tools unavailable to a Devin session were removed.

### anthropics/skills — Apache-2.0

- Source: <https://github.com/anthropics/skills>
- Commit inspected: `41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f`
- License: Apache License 2.0, per-skill `LICENSE.txt` (`skills/webapp-testing/LICENSE.txt`,
  `skills/frontend-design/LICENSE.txt`). Redistribution of modified work is permitted with
  attribution; this section is that attribution.

**`skills/webapp-testing/SKILL.md` → adapted into `test-web-pages/SKILL.md`**

- Adapted: the reconnaissance-then-action ordering (drive the running app, wait for the page to
  settle, inspect the rendered DOM, derive selectors from what actually rendered rather than
  from source), the "inspect before asserting" pitfall, and the preference for descriptive
  role/text locators.
- Material modifications: rewritten from Python `sync_playwright` to this repository's
  TypeScript `@playwright/test` stack; the bundled `scripts/with_server.py` server-lifecycle
  helper and `examples/*.py` are not vendored and are replaced by `playwright.config.ts`'s
  `webServer`; the static-HTML/`file://` branch of its decision tree was dropped as
  inapplicable. Added, not from upstream: the negative-authorization matrix, direct-API bypass
  testing, no-mutation/no-success-audit assertions, 1280px/375px checks, restart persistence
  verification, and the rule that tests never touch the developer demo database.

**`skills/frontend-design/SKILL.md` → partially adapted into `frontend-design/SKILL.md`**

- Adapted: the quality floor (responsive to mobile, visible keyboard focus, reduced motion
  respected, accessible colour), restraint and self-critique including reviewing screenshots
  while building, and the interface-writing principles (name things in the user's language,
  active voice, a control labelled with what it does, action vocabulary kept consistent from
  button through result, errors that explain what to do next, empty states as an invitation to
  act).
- Deliberately **not** adopted: the distinctive-visual-identity brief, aesthetic risk-taking,
  hero treatments, typographic personality and the two-pass design-token brainstorm. This
  repository wants a boring, uniform operations console reusable across 13 apps; a distinct
  visual identity per tool would be a defect. Its list of "AI-generated design tells" was also
  dropped as irrelevant to a dense internal console.

### obra/superpowers — MIT

- Source: <https://github.com/obra/superpowers>
- Commit inspected: `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`
- License: MIT, `LICENSE` — Copyright (c) 2025 Jesse Vincent. Permission notice retained here.
- Only `skills/verification-before-completion`, `skills/requesting-code-review` and
  `skills/finishing-a-development-branch` were inspected. The Superpowers plugin itself, its
  bootstrap, hooks and remaining skills are **not** installed.

**→ adapted into `review-before-pr/SKILL.md`**

- Adapted: the evidence-before-completion principle (no completion claim without fresh
  verification output; identify the command, run it in full, read the output and exit code,
  then state only what was observed), reviewing the actual diff rather than a summary before
  handing off, verifying a green suite before finishing a branch, and the PR-handoff step of
  pushing and creating the PR against the confirmed base using the repository's template.
- Material modifications: condensed to a single linear checklist and rewritten around this
  project's concrete risks (server-side authorization, source-of-truth ownership, external
  state leaking into SQLite, idempotency, audit gaps, migration/seed safety, secrets).
  Upstream's code-reviewer subagent dispatch, `code-reviewer.md` template, git-worktree
  detection and cleanup, the interactive 3-option integration menu and the discard-confirmation
  flow are not imported — this repository always uses branch + PR, and Devin Review provides
  the independent review. Upstream's rationalization/red-flag tables were not copied.

### vercel-labs/agent-skills — license unclear, paraphrased only

- Source: <https://github.com/vercel-labs/agent-skills>
  (`skills/react-best-practices`, `skills/web-design-guidelines`)
- Commit inspected: `063bee94c3f4df8453406c830b0a7df0f2860278`
- **License status: unclear.** The repository ships **no `LICENSE` file** and its `package.json`
  is marked `"private": true` with no `license` field. `skills/react-best-practices/SKILL.md`
  declares `license: MIT` in its own frontmatter, but no MIT license text or copyright holder is
  provided anywhere in the repository, and `skills/web-design-guidelines` declares no license at
  all.
- **Decision:** because redistribution terms cannot be confirmed, **no text or code from this
  repository was copied or vendored.** The procedural ideas were paraphrased from scratch in our
  own words, and only the ideas we independently judged relevant to this app were kept. No rule
  files, compiled `AGENTS.md`, `metadata.json` or `.zip` bundles were installed. If the upstream
  licensing is clarified later, this decision can be revisited.
- Ideas paraphrased into `frontend-design/SKILL.md`: prioritising elimination of request
  waterfalls (parallelise independent async work; do not await data a branch never uses; return
  early on denied paths before fetching); streaming slow sections behind Suspense boundaries;
  minimising what crosses the server/client serialisation boundary; keeping `'use client'` at
  the leaves; authorizing server-side entry points the same way as API routes; avoiding
  client-side fetch waterfalls for data the server already had; deriving state during render
  instead of synchronising it in an effect; not defining components inside components. From
  `web-design-guidelines`, the paraphrased idea is the practice of auditing UI code against an
  explicit interface checklist (accessibility, focus behaviour, forms, tables, loading/empty/
  error states, responsive layout) rather than reviewing it impressionistically. Its mechanism —
  fetching <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>
  at review time — was dropped so the skill stays runnable without network access; the checklist
  is inlined instead.

### github-issue-lifecycle — no external baseline

Written specifically for this repository: `gh issue` only, the `priority:*`/`status:*` label
scheme, dependency-closed verification before starting, and the explicit no-GitHub-Project
constraint. No upstream source.
