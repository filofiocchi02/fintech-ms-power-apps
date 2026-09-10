import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';

import { closeDb, createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { auditEvents, kycCaseWorkflow } from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';

/**
 * Issue #6 demo recording. One continuous pass through the reviewer's demo sequence, in the
 * order the issue asks for it:
 *
 *   role/tab gating → KYC invariant + escalation → refund idempotency + large approval →
 *   production flag confirmation → audit timeline
 *
 * `video: 'on'` records the whole test; the .webm lands in test-results/ and is copied into
 * the PR evidence. Every step also asserts, so the recording is a test, not a screen grab.
 *
 * It is evidence tooling, not a regression gate: it mutates the shared payments fixture the
 * refunds spec also reads, so it only runs when asked for explicitly —
 * `RECORD_DEMO=1 npx playwright test e2e/demo-recording.spec.ts`. This mirrors the
 * REFUNDS_RESTART_STATE gate on the restart-persistence test.
 */

test.use({ video: 'on' });

const E2E_DB_PATH = './data/e2e.db';
// PEP-flagged case no other spec mutates: complete docs, so approval needs the override.
const ESCALATED_CASE = { id: 'kycwf_0008', customer: 'Iota Retail Ltd' };
const evidenceDir = 'test-results/demo-recording';

function evidence(name: string) {
  const dir = join(evidenceDir);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name}.png`);
}

function restoreCase(caseId: string) {
  runMigrations(E2E_DB_PATH);
  const db = createDb(E2E_DB_PATH);
  try {
    db.delete(auditEvents).where(eq(auditEvents.subjectRef, caseId)).run();
    db.delete(kycCaseWorkflow).where(eq(kycCaseWorkflow.id, caseId)).run();
    seedDatabase(db);
  } finally {
    closeDb(db);
  }
}

async function actAsUser(page: Page, userId: string) {
  const res = await page.request.post('/api/demo/role', { data: { userId } });
  expect(res.ok()).toBe(true);
}

async function apiPost(page: Page, path: string, body?: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, payload: await response.json() };
    },
    { path, body: body ?? null },
  );
}

test('demo evidence sequence', async ({ page }, testInfo) => {
  test.skip(!process.env.RECORD_DEMO, 'evidence tooling: run standalone with RECORD_DEMO=1');
  test.skip(testInfo.project.name !== 'desktop-1280', 'one recording, desktop width');
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  // ── 1. Role / tab gating ──────────────────────────────────────────────────────
  await page.goto('/');
  await actAsUser(page, 'user_sam'); // Support Agent
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Refunds' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'KYC' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Feature Flags' })).toBeHidden();
  await page.screenshot({ path: evidence('01-support-tabs') });

  // A manually typed forbidden URL bounces home and leaks nothing.
  await page.goto('/kyc');
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Delta LLC', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: evidence('02-support-kyc-blocked') });

  // ── 2. KYC invariant + escalation ─────────────────────────────────────────────
  restoreCase(ESCALATED_CASE.id);
  await actAsUser(page, 'user_casey'); // Compliance Analyst
  await page.goto(`/kyc/${ESCALATED_CASE.id}`);
  await expect(page.getByText('PEP screening matched a director who held a public appointment until 2024.')).toBeVisible();

  await page.getByRole('button', { name: 'Claim case' }).click();
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();
  // The sanctions invariant disables approval and the server enforces the same rule.
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await expect(page.getByText('Approval unavailable')).toBeVisible();
  await page.screenshot({ path: evidence('03-kyc-sanctions-blocked') });

  const direct = await apiPost(page, `/api/kyc/cases/${ESCALATED_CASE.id}/decision`, {
    decision: 'APPROVE',
    reason: 'Bypassing the disabled button',
    expectedVersion: 2,
  });
  expect(direct.status).toBe(403);

  await page.getByRole('button', { name: 'Escalate to manager' }).click();
  await page.getByLabel('Escalation reason').fill('PEP hit needs the manager tier.');
  await page.getByRole('button', { name: 'Confirm escalation' }).click();
  await expect(page.getByText('Morgan Hale').first()).toBeVisible();

  await actAsUser(page, 'user_morgan'); // Manager / Admin
  await page.goto(`/kyc/${ESCALATED_CASE.id}`);
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByLabel('Decision reason').fill('PEP match adjudicated: former office holder, cleared.');
  await page.getByRole('button', { name: 'Approve case' }).click();
  await expect(page.getByText('APPROVED').first()).toBeVisible();
  await page.screenshot({ path: evidence('04-kyc-escalated-approved') });

  // ── 3. Refund idempotency + large approval ────────────────────────────────────
  await actAsUser(page, 'user_sam');
  await page.goto('/refunds/transactions/pay_9005');
  await page.getByLabel(/^Amount \(/).fill('600');
  await page.getByLabel('Reason', { exact: true }).fill('Duplicate charge reported by customer');
  const key = `demo-${crypto.randomUUID()}`;
  await page.getByLabel('Idempotency key').fill(key);
  await page.getByRole('button', { name: 'Review refund', exact: true }).click();
  await page.getByRole('button', { name: 'Send for approval', exact: true }).click();
  await expect(page.getByText('PENDING APPROVAL')).toBeVisible();
  // No money moved while it waits: the balance is unchanged.
  await expect(page.locator('dt').filter({ hasText: /^Remaining refundable$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('£1,800.00');
  await page.screenshot({ path: evidence('05-refund-pending') });

  // Replaying the same idempotency key returns the same case — it does not pay twice.
  const replay = await apiPost(page, '/api/refunds', {
    paymentRef: 'pay_9005',
    amountMinor: 60000,
    reason: 'Duplicate charge reported by customer',
    idempotencyKey: key,
    confirmed: true,
  });
  expect(replay.status).toBe(200);
  expect(replay.payload.data.replayed).toBe(true);

  await actAsUser(page, 'user_morgan');
  await page.goto('/refunds');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByLabel('Approval note').fill('Duplicate charge confirmed with merchant');
  await page.getByRole('button', { name: 'Approve and refund' }).click();
  await expect(page.getByText('EXECUTED').first()).toBeVisible();
  await page.screenshot({ path: evidence('06-refund-approved-executed') });

  // ── 4. Production flag confirmation ───────────────────────────────────────────
  await actAsUser(page, 'user_riley'); // Release Engineer
  await page.goto('/flags?env=production&key=new-dashboard');
  await expect(page.getByText('Production changes are restricted to Manager / Admin')).toBeVisible();
  await page.screenshot({ path: evidence('07-flags-prod-readonly-re') });

  await actAsUser(page, 'user_morgan');
  await page.goto('/flags?env=production&key=new-dashboard');
  await page.getByRole('button', { name: /flag$/ }).click();
  await page.getByLabel('Reason').fill('Enable console shell for production ramp');
  const apply = page.getByRole('button', { name: 'Apply change' });
  await expect(apply).toBeDisabled();
  await page.getByLabel(/Type the flag key/).fill('new-dashboard');
  await apply.click();
  await expect(page.getByText('Enabled').first()).toBeVisible();
  await page.screenshot({ path: evidence('08-flags-prod-confirmed') });

  // ── 5. Audit timeline ─────────────────────────────────────────────────────────
  await page.goto(`/kyc/${ESCALATED_CASE.id}`);
  const timeline = page.locator('ol').filter({ hasText: 'kyc:' });
  await expect(timeline.getByText('DENIED').first()).toBeVisible();
  await expect(timeline.getByText('ACCEPTED').first()).toBeVisible();
  await expect(timeline.getByText('kyc:escalate')).toBeVisible();
  await expect(timeline.getByText('PEP match adjudicated: former office holder, cleared.')).toBeVisible();
  await page.screenshot({ path: evidence('09-audit-timeline') });

  // The only allowed console noise is the browser logging the refused fetches we made.
  expect(errors.filter((e) => !/Failed to load resource.*40[39]/.test(e))).toEqual([]);
});
