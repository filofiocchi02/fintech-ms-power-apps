import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';

import { closeDb, createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { auditEvents, kycCaseWorkflow } from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';

/**
 * Browser verification of the KYC review queue.
 *
 * Covers the real reviewer flow, the authorization boundary from the browser *and* from a
 * direct API call that skips the UI entirely, and both viewport widths.
 */

const E2E_DB_PATH = './data/e2e.db';

const ORDINARY_CASE = 'kycwf_0001';
const SANCTIONS_CASE = 'kycwf_0004';

/**
 * The two viewport projects share one server and one database, so each gets its own
 * complete, undecided case to work on and never touches the other's rows.
 *
 * `needsClaim` covers the two entry states: an unassigned case must be claimed before it
 * can be decided, while a case already on your tier is decided directly.
 */
const DECIDABLE_CASE: Record<
  string,
  { id: string; customer: string; role: string; needsClaim: boolean }
> = {
  'desktop-1280': { id: ORDINARY_CASE, customer: 'Acme Corp', role: 'compliance', needsClaim: true },
  // Seeded IN_REVIEW on the Manager / Admin tier, as if it had been escalated.
  'mobile-375': { id: 'kycwf_0005', customer: 'Epsilon AB', role: 'manager-admin', needsClaim: false },
};

/**
 * Cases that carry a screening hit, one per project. Approval needs the override tier for
 * both; the desktop one must be claimed first while the mobile one is seeded as already
 * held by the demo Compliance Analyst.
 */
const OVERRIDE_CASE: Record<
  string,
  { id: string; flag: string; needsClaim: boolean }
> = {
  'desktop-1280': { id: SANCTIONS_CASE, flag: 'Sanctions hit', needsClaim: true },
  'mobile-375': { id: 'kycwf_0003', flag: 'PEP hit', needsClaim: false },
};

/** Open, unassigned cases each project can claim and then escalate. */
const ESCALATABLE_CASE: Record<string, { id: string; customer: string }> = {
  'desktop-1280': { id: 'kycwf_0002', customer: 'Beta Ltd' },
  'mobile-375': { id: 'kycwf_0006', customer: 'Zeta GmbH' },
};

/**
 * A decision is permanent, so the case under test is returned to its seeded state first.
 * Only that case is touched, and rows are deleted rather than the file: the app server
 * holds this database open, and the other project is reading it concurrently.
 */
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

/**
 * A deliberate denial probe makes Chrome log the 403 itself. That browser-generated line is
 * not an application error, so it is excluded; anything else still fails the test.
 */
function unexpected(errors: string[]): string[] {
  return errors.filter((error) => !/Failed to load resource.*40[13]/.test(error));
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function actAsRole(page: Page, role: string) {
  const res = await page.request.post('/api/demo/role', { data: { role } });
  expect(res.ok()).toBe(true);
}

/**
 * Calls the API the way an operator bypassing the UI would: from the loaded page, with the
 * real session cookie, rather than through Playwright's out-of-browser request context.
 */
async function apiCall(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: { success: boolean; error?: { code: string } } }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, payload: await response.json() };
    },
    { method, path, body: body ?? null },
  );
}

test.describe('KYC review queue', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('A reviewer filters the queue, claims a case, and approves it', async ({
    page,
  }, testInfo) => {
    const target = DECIDABLE_CASE[testInfo.project.name];
    restoreCase(target.id);

    const errors = collectConsoleErrors(page);
    await actAsRole(page, target.role);

    await page.goto('/kyc');
    await expect(page.getByRole('heading', { level: 1, name: 'KYC review queue' })).toBeVisible();
    await expect(page.getByRole('link', { name: target.customer })).toBeVisible();

    await page.getByLabel('Risk').selectOption('high');
    await expect(page.getByRole('link', { name: target.customer })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Delta LLC' })).toBeVisible();

    const searchBox = page.getByLabel('Search by customer');
    await searchBox.fill('Delta');
    await searchBox.press('Enter');
    await expect(page).toHaveURL(/risk=high&search=Delta/);
    await expect(page.getByRole('link', { name: 'Delta LLC' })).toBeVisible();

    // Emptying the box and then touching another filter must drop the old search term.
    await searchBox.fill('');
    await page.getByLabel('Risk').selectOption('low');
    await expect(page).not.toHaveURL(/search=/);
    await expect(page.getByRole('link', { name: 'Beta Ltd' })).toBeVisible();

    await page.getByRole('link', { name: 'Clear' }).click();
    await expect(searchBox).toHaveValue('');
    await expect(page.getByRole('link', { name: 'Delta LLC' })).toBeVisible();

    await page.getByRole('link', { name: target.customer }).click();
    await expect(page).toHaveURL(`/kyc/${target.id}`);
    await expect(page.getByText('Provider evidence (KycProviderConnector)')).toBeVisible();
    await expect(page.getByText('Review workflow (app-owned)')).toBeVisible();

    // An unassigned case offers no decision buttons until it is claimed; a case already on
    // the reviewer's tier is decided directly.
    const claimButton = page.getByRole('button', { name: 'Claim case' });
    if (target.needsClaim) {
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeHidden();
      await claimButton.click();
    }
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByLabel('Decision reason').fill('Documents verified, no adverse findings.');
    await page.getByRole('button', { name: 'Approve case' }).click();

    await expect(page.getByText('APPROVED').first()).toBeVisible();
    await expect(page.getByText('Documents verified, no adverse findings.').first()).toBeVisible();
    await expect(page.getByText('ACCEPTED')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Compliance cannot approve a screening hit, from the UI or the API', async ({
    page,
  }, testInfo) => {
    const target = OVERRIDE_CASE[testInfo.project.name];
    restoreCase(target.id);

    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'compliance');

    await page.goto(`/kyc/${target.id}`);
    await expect(page.getByText(target.flag).first()).toBeVisible();

    if (target.needsClaim) {
      // The case is unassigned: there is no Approve to press until it is claimed, and a
      // direct API decision without holding the case is refused too.
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeHidden();
      const premature = await apiCall(page, 'POST', `/api/kyc/cases/${target.id}/decision`, {
        decision: 'APPROVE',
        reason: 'Deciding without claiming.',
        expectedVersion: 1,
      });
      expect(premature.status).toBe(403);
      expect(premature.payload.error?.code).toBe('FORBIDDEN');

      await page.getByRole('button', { name: 'Claim case' }).click();
    }

    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
    await expect(page.getByText('Manager / Admin override').first()).toBeVisible();

    // The disabled button is a courtesy; the same attempt made directly against the API,
    // with a valid Compliance session holding the case, must also be refused.
    const res = await apiCall(page, 'POST', `/api/kyc/cases/${target.id}/decision`, {
      decision: 'APPROVE',
      reason: 'Bypassing the UI.',
      expectedVersion: 2,
    });
    expect(res.status).toBe(403);
    expect(res.payload.error?.code).toBe('FORBIDDEN');

    await page.reload();
    await expect(page.getByText('APPROVED')).toBeHidden();

    expect(unexpected(errors)).toEqual([]);
  });

  test('an escalated case lands in the Manager / Admin queue, assigned to them', async ({
    page,
  }, testInfo) => {
    const target = ESCALATABLE_CASE[testInfo.project.name];
    restoreCase(target.id);

    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'compliance');

    await page.goto(`/kyc/${target.id}`);
    await page.getByRole('button', { name: 'Claim case' }).click();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Escalate to manager' }).click();
    await page.getByLabel('Escalation reason').fill('Exceeds analyst authority.');
    await page.getByRole('button', { name: 'Confirm escalation' }).click();

    // The analyst no longer holds the case, so the decision buttons are gone.
    await expect(page.getByText('demo_manager-admin').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeHidden();
    await expect(page.getByText('kyc:escalate')).toBeVisible();

    // The manager sees the case as assigned to them and can act on it.
    await actAsRole(page, 'manager-admin');
    await page.goto('/kyc?assignee=me');
    await expect(page.getByRole('link', { name: target.customer })).toBeVisible();

    await page.getByRole('link', { name: target.customer }).click();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    // Manager / Admin is the top tier: there is nowhere further to escalate.
    await expect(page.getByRole('button', { name: 'Escalate to manager' })).toBeHidden();

    expect(unexpected(errors)).toEqual([]);
  });

  test('Support Agent is refused the KYC page and the KYC API', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'support');

    await page.goto(`/kyc/${ORDINARY_CASE}`);
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Provider evidence')).toBeHidden();

    const list = await apiCall(page, 'GET', '/api/kyc/cases');
    expect(list.status).toBe(403);
    expect(list.payload.error?.code).toBe('FORBIDDEN');

    const decision = await apiCall(page, 'POST', `/api/kyc/cases/${ORDINARY_CASE}/decision`, {
      decision: 'APPROVE',
      reason: 'Support approving anyway.',
      expectedVersion: 1,
    });
    expect(decision.status).toBe(403);

    expect(unexpected(errors)).toEqual([]);
  });

  test('captures queue and detail screenshots at this viewport', async ({ page }, testInfo) => {
    await actAsRole(page, 'manager-admin');

    await page.goto('/kyc');
    await expect(page.getByRole('heading', { level: 1, name: 'KYC review queue' })).toBeVisible();
    await testInfo.attach(`kyc-queue-${testInfo.project.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.goto(`/kyc/${SANCTIONS_CASE}`);
    await expect(page.getByText('Provider evidence (KycProviderConnector)')).toBeVisible();
    await testInfo.attach(`kyc-detail-${testInfo.project.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
