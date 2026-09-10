---
name: frontend-design
description: Build or change operations-console UI for an issue, reusing the shared shell and checking accessibility, states, responsiveness and React/Next data-fetching performance.
argument-hint: <issue-number>
triggers:
  - user
---

# Frontend design

`$1` is the issue number. This is a dense internal operations console, not a landing page.
The goal is an operator who can clear a queue quickly and cannot mistake a dangerous action
for a safe one.

## Step 1 — Read before editing

1. `gh issue view $1` — the acceptance criteria list the exact screens, filters, actions and
   negative paths. Build those, not your own idea of the feature.
2. `AGENTS.md` — architecture, security and UI-style rules.
3. **The existing shared code**, before writing a single component:
   - `src/components/**` — shell, tables, filters, detail layouts, badges, confirmations
   - `src/features/**` — how other tools compose those
   - `src/lib/auth/**` — the capability names your UI must mirror

   Reuse what is there. If a shared primitive is close but not right, extend it. **Do not
   introduce a second component system, styling approach, or table implementation** — reuse
   across apps #4–#13 is the thing this prototype is measuring, and a parallel component set
   destroys the measurement and causes integration conflicts.

## Step 2 — Boundaries that are easy to break in UI code

- Data reaches a page through Route Handlers and the connector/repository interfaces. Never
  import a fixture or a mock module into a React page or component.
- Mirror the server's capabilities in the UI so operators only see what they can do — and
  treat that as a courtesy only. The server check is the boundary and must already exist.
  Never remove or weaken a server check because the button is hidden.

## Step 3 — Build

Structure and hierarchy:

- Lead with the operator's job: the queue or search result, densely. No hero sections.
- Make state that changes the consequence of an action impossible to miss: environment
  (dev/staging/prod), risk level, case status, approval state. Badges with text, not colour
  alone — colour-blind operators approve payments too.
- Structural devices (rules, borders, groupings, column order) should encode information.
  Drop anything decorative.
- Tables: real `<table>` markup with `<th scope>`, aligned numerals for money, most
  decision-relevant columns leftmost. Money is formatted from minor units; never a bare float.

Actions and mutations:

- Label a control with what it does — "Approve refund", not "Submit". Keep the same verb from
  the button through the confirmation to the result message.
- Every destructive or financial mutation gets an explicit confirmation that states the
  concrete consequence (amount, customer, environment). Production flag writes require the
  typed flag key and a reason.
- Disable the submit control while a mutation is in flight and make the pending state visible,
  so an operator cannot double-submit a payment.

Every view needs four states, not one:

- **Loading** — skeleton or pending affordance sized like the real content.
- **Empty** — say what would appear here and what to do next. An empty queue is good news;
  say so.
- **Error** — what failed and what to do about it, from the typed error. Never a stack trace,
  never a bare "Something went wrong".
- **Denied** — a clear "you do not have access" for a capability the operator lacks.

Accessibility and responsiveness:

- Labels tied to inputs, not placeholder-only fields. Errors associated with their field.
- Keyboard reachable in a sensible order; visible focus; focus moves into a dialog and returns
  on close; `Esc` closes.
- Respect reduced motion. Motion only to show what changed after an action.
- Works at 1280px (primary) and remains usable at 375px.

Next.js / React performance — the ones that actually bite in this app:

- Server Components by default. `'use client'` only for a component that needs interactivity,
  and push it to the leaves so a whole page does not ship to the browser.
- Fetch independent data in parallel (`Promise.all`) rather than awaiting in sequence; a
  waterfall of connector calls is the usual cause of a slow queue page.
- Do not await data the chosen branch never uses; return early on the denied path before
  fetching anything.
- Stream slow sections behind `Suspense` instead of blocking the whole page, when the layout
  does not depend on that data.
- Pass only the fields a client component needs across the server/client boundary — not whole
  connector responses, which is also how PII leaks into the HTML payload.
- Avoid client-side fetch waterfalls for data the server already had.
- Do not define components inside components; derive values during render instead of syncing
  them with an effect.

## Step 4 — Self-check before handing off

Read your own diff and answer:

- Every new page and API route has a server-side app-access check, and every sensitive action
  has its own independent check.
- No fixture import in a page, component or route handler.
- Loading, empty, error and denied states exist for each new view.
- Labels, focus and keyboard paths work; nothing conveys meaning by colour alone.
- No new component system; shared primitives reused.
- No `'use client'` on a component that does not need it.
- Copy is plain, active, and consistent from button to result.

Then run `test-web-pages` with the same issue number. Screenshots are part of the check, not
an afterthought — look at the rendered page before claiming the UI is done.

## Provenance

Synthesized from Vercel's React/Next.js performance guidance and web interface review
guidelines (paraphrased) and Anthropic's frontend-design skill (Apache-2.0). Anthropic's
distinctive-visual-identity guidance is deliberately mostly excluded: this is a boring
consistent console by design. What is kept from it is the quality floor, restraint,
screenshot-based self-critique, and interface-copy discipline. See
`.agents/skills/README.md`.
