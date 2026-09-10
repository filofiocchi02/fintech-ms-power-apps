import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransactionDetail } from '../src/features/refunds/service';

// Run against a fresh scratch DB and server (playwright.config.ts), never the demo DB.
// Money-moving cases run once; both projects exercise authorization and responsive UI.
const evidenceDir = process.env.REFUNDS_EVIDENCE_DIR ?? 'test-results/refunds-evidence';
const endpoint = '/api/refunds';
const detailUrl = (ref: string) => `/refunds/transactions/${ref}`;
const apiDetail = (ref: string) => `${endpoint}/transactions/${ref}`;
test.setTimeout(90_000);
const expectedResourceFailures = new WeakMap<Page, Set<string>>();

// Chromium honors Secure cookies on loopback HTTP; APIRequestContext does not.
// Direct requests bypass the UI but use the browser's session without copying cookies.
function request(page: Page) {
  const send = async (path: string, method: string, data?: unknown) => {
    const response = await page.evaluate(async ({ path, method, data }) => {
      const result = await fetch(path, {
        method, headers: { 'content-type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return { status: result.status, body: await result.json() };
    }, { path, method, data });
    return {
      status: () => response.status, json: async () => response.body,
      acknowledgeExpectedResourceFailure: () => {
        expectedResourceFailures.get(page)?.add(`${new URL(path, page.url()).href}|${response.status}`);
      },
    };
  };
  return {
    get: (path: string) => send(path, 'GET'),
    post: (path: string, options: { data: unknown }) => send(path, 'POST', options.data),
  };
}

function evidence(name: string) {
  const dir = join(evidenceDir, test.info().project.name);
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

async function shot(page: Page, name: string) {
  const path = evidence(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

function errorsOn(page: Page) {
  const errors: { text: string; resourceKey?: string }[] = [];
  const expected = new Set<string>();
  expectedResourceFailures.set(page, expected);
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const resource = /^Failed to load resource: the server responded with a status of (\d{3}) \([^)]+\)$/.exec(text);
    errors.push({ text, resourceKey: resource ? `${message.location().url}|${resource[1]}` : undefined });
  });
  page.on('pageerror', (error) => errors.push({ text: `pageerror: ${error.message}` }));
  // Expected direct negative probes generate Chromium resource errors. Exempt only
  // canonical messages matching a URL/status whose typed refusal was asserted below.
  // Preserve every message as evidence; never exempt JS pageerrors or other errors.
  return {
    all: errors,
    get unexpected() { return errors.filter((error) => !error.resourceKey || !expected.has(error.resourceKey)); },
  };
}

async function role(page: Page, value: string) {
  if (await page.getByLabel('Act as role').inputValue() === value) return;
  await Promise.all([
    page.waitForEvent('load'),
    page.getByLabel('Act as role').selectOption(value),
  ]);
  await expect(page.getByLabel('Act as role')).toHaveValue(value);
}

async function detail(page: Page, ref: string): Promise<TransactionDetail> {
  const response = await request(page).get(apiDetail(ref));
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  return body.data;
}

const accepted = (state: TransactionDetail) => state.auditTrail.filter((row) => row.outcome === 'ACCEPTED');
const stable = (state: TransactionDetail) => ({
  transaction: state.transaction, paymentRefunds: state.paymentRefunds, cases: state.cases,
  accepted: accepted(state),
});

async function refusal(response: Awaited<ReturnType<ReturnType<typeof request>['get']>>, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.success).toBe(false);
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  expect(JSON.stringify(body)).not.toMatch(/stack|node_modules|\.tsx?:\d|at Object\./);
  response.acknowledgeExpectedResourceFailure();
}

async function fillRefund(page: Page, amount: string, reason: string, key?: string) {
  await page.getByLabel(/^Amount \(/).fill(amount);
  await page.getByLabel('Reason', { exact: true }).fill(reason);
  if (key) await page.getByLabel('Idempotency key').fill(key);
}

async function submitRefund(page: Page, pending = false) {
  await page.getByRole('button', { name: 'Review refund', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const response = page.waitForResponse((r) => r.url().endsWith(endpoint) && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: pending ? 'Send for approval' : 'Refund now', exact: true }).click();
  const result = await response;
  const body = await result.json();
  await expect(dialog).not.toBeVisible();
  return { status: result.status(), body };
}

async function balanceOnPage(page: Page, expected: string) {
  await expect.soft(page.locator('dt').filter({ hasText: /^Remaining refundable$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText(expected);
}

async function renderedResult(page: Page, ref: string, balance: string, amounts: string[], name: string) {
  const original = page.viewportSize()!;
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.reload();
    await balanceOnPage(page, balance);
    const history = page.getByRole('table', { name: 'Refunds executed by the payments system' });
    await expect(history.locator('tbody tr')).toHaveCount(amounts.length);
    for (const amount of amounts) await expect(history).toContainText(amount);
    await expect(page.getByText('refunds:execute', { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await shot(page, `${name}-${width}`);
    // Documented shared DataTable limitation: horizontal scrolling is required.
    // Scroll the real history cell into view so the mobile evidence shows its amount.
    if (width === 375) {
      await history.getByRole('cell', { name: amounts[0], exact: true }).scrollIntoViewIfNeeded();
      await shot(page, `${name}-${width}-history-scrolled`);
    }
    await page.getByRole('link', { name: 'Back to search', exact: true }).click();
    await expect(page).toHaveURL('/refunds');
    await page.reload();
    const row = page.getByRole('table', { name: 'Payment transactions matching the current search' })
      .getByRole('row').filter({ has: page.getByRole('link', { name: ref, exact: true }) });
    if (balance === '£0.00') await expect(row).toHaveCount(0);
    else {
      await expect(row.getByRole('cell').nth(4)).toHaveText(balance);
      await row.getByRole('cell').nth(4).scrollIntoViewIfNeeded();
    }
    await shot(page, `dashboard-${name}-${width}`);
    await page.goto(detailUrl(ref));
  }
  await page.setViewportSize(original);
}

test.skip('Documented limitation: native dialog Tab can reach browser chrome', async () => {
  // Frozen ConfirmationDialog: strict focus trapping is not claimed.
});
test.skip('Documented limitation: 375px DataTable requires horizontal scrolling', async () => {
  // Frozen DataTable: no document overflow and reachable actions are tested instead.
});

test('search, seeded external history and responsive keyboard navigation', async ({ page }) => {
  const errors = errorsOn(page);
  await page.goto('/refunds');
  await role(page, 'support');
  await page.goto('/refunds');
  await expect(page.getByRole('heading', { name: 'Refund Operations', exact: true })).toBeVisible();
  await shot(page, 'dashboard');
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'dashboard has no document horizontal overflow').toBe(true);
  await page.getByLabel('Search transactions').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeFocused();
  await shot(page, 'search-keyboard-focus');
  for (const query of ['Delta', 'delta.example', 'person@delta.example', 'cus_1004', 'pay_9004']) {
    await page.getByLabel('Search transactions').fill(query);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(query)}$`));
    await expect(page.getByRole('link', { name: 'pay_9004', exact: true }).first()).toBeVisible();
  }
  await page.getByLabel('Search transactions').fill('no-such-payment-98765');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No matching transactions', { exact: true })).toBeVisible();
  await shot(page, 'empty-search');
  await page.goto(detailUrl('pay_9004'));
  await expect(page.getByText('PSP console', { exact: true })).toBeVisible();
  await expect(page.getByText('rfnd_8001', { exact: true })).toBeVisible();
  await balanceOnPage(page, '$500.00');
  await shot(page, 'payment-detail');
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'detail has no document horizontal overflow').toBe(true);
  await fillRefund(page, '1.00', 'Keyboard confirmation only');
  await page.getByLabel('Reason', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Review refund', exact: true })).toBeFocused();
  await shot(page, 'detail-keyboard-focus');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Refund $1.00 to Delta LLC');
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    const focusInside = await dialog.evaluate((el) => el.contains(document.activeElement));
    if (!focusInside) {
      await shot(page, 'focus-outside-dialog');
      writeFileSync(evidence('focus-outside-dialog.json'), JSON.stringify(await page.evaluate(() => ({
        tag: document.activeElement?.tagName, text: document.activeElement?.textContent,
        documentHasFocus: document.hasFocus(),
      })), null, 2));
    }
    // Native dialog may move focus to browser chrome, but not background app controls.
    if (!focusInside) expect(await page.evaluate(() => document.hasFocus())).toBe(false);
  }
  await shot(page, 'confirmation-focus');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect.soft(page.getByRole('button', { name: 'Review refund', exact: true })).toBeFocused();
  await page.goto(detailUrl('pay_9006'));
  await expect(page.getByText('This payment has no refundable balance remaining.')).toBeVisible();
  await expect(page.getByLabel(/^Amount \(/)).toHaveCount(0);
  await shot(page, 'fully-refunded-seed');
  expect.soft(errors.unexpected, 'JS pageerrors and unexpected console errors').toEqual([]);
});

test('support partial/full refund, replay, excessive and invalid amounts', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'Money-moving scenario runs once against shared scratch ledger');
  const errors = errorsOn(page);
  await page.goto('/refunds');
  await role(page, 'support');
  await page.goto(detailUrl('pay_9001'));
  const initial = await detail(page, 'pay_9001');
  expect(initial.transaction.refundableMinor).toBe(5000);
  expect(initial.cases).toHaveLength(0);
  await page.getByLabel('Amount (GBP)').fill('10.00');
  await expect(page.getByRole('button', { name: 'Review refund', exact: true })).toBeDisabled();
  const key = `e2e-partial-${crypto.randomUUID()}`;
  await fillRefund(page, '10.00', 'E2E partial refund', key);

  // Delay forwarding a real request, not its response, to inspect in-flight controls.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/refunds', async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Review refund', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Refund £10.00 to Acme Corp against pay_9001');
  const sent = page.waitForResponse((r) => r.url().endsWith(endpoint) && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Refund now', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submitting…', exact: true })).toBeDisabled();
  await expect(dialog, 'confirmation closes while request is in flight').not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Working…', exact: true })).toHaveCount(0);
  await shot(page, 'in-flight-confirmation');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('button', { name: 'Submitting…', exact: true })).toBeDisabled();
  await expect(dialog).not.toBeVisible();
  await shot(page, 'in-flight-confirmation-375');
  await page.setViewportSize({ width: 1280, height: 800 });
  release();
  const result = await sent;
  expect(result.status()).toBe(201);
  const partial = (await result.json()).data;
  expect(partial.case.status).toBe('EXECUTED');
  await expect(dialog).not.toBeVisible();
  await page.unroute('**/api/refunds');
  await expect(page.getByRole('table', { name: 'App-owned refund requests for this payment' })).toContainText('E2E partial refund');
  await balanceOnPage(page, '£40.00');
  await shot(page, 'partial-refund-and-audit');
  await renderedResult(page, 'pay_9001', '£40.00', ['£10.00'], 'partial-refund');
  const afterPartial = await detail(page, 'pay_9001');
  expect.soft(afterPartial.transaction.refundableMinor, 'connector GET remaining after partial').toBe(4000);
  expect.soft(afterPartial.paymentRefunds, 'connector GET history after partial').toHaveLength(1);
  expect(afterPartial.cases).toHaveLength(1);
  expect(accepted(afterPartial).map((a) => a.action).sort()).toEqual(['refunds:execute', 'refunds:request']);

  await fillRefund(page, '40.01', 'Excess over remaining');
  await expect.soft(page.getByRole('button', { name: 'Review refund', exact: true }), 'UI refuses amount above actual remaining').toBeDisabled({ timeout: 1000 });
  await expect(page.getByText('Exceeds the remaining refundable balance of £40.00.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('button', { name: 'Review refund', exact: true })).toBeDisabled();
  await shot(page, 'refused-excessive-refund-375');
  await page.setViewportSize({ width: 1280, height: 800 });
  const body = { paymentRef: 'pay_9001', amountMinor: 4001, reason: 'Excess over remaining', idempotencyKey: `e2e-excess-${crypto.randomUUID()}`, confirmed: true };
  await refusal(await request(page).post(endpoint, { data: body }), 400, 'VALIDATION');
  expect(stable(await detail(page, 'pay_9001'))).toEqual(stable(afterPartial));
  // If stale UI allows review, exercise the server refusal through the browser too.
  if (await page.getByRole('button', { name: 'Review refund', exact: true }).isEnabled()) {
    const refused = await submitRefund(page);
    expect(refused.status).toBe(400);
    await expect(page.getByText('Refund not processed', { exact: true })).toBeVisible();
  }
  await shot(page, 'refused-excessive-refund');
  for (const invalid of [
    { amountMinor: 0 }, { amountMinor: -1 }, { amountMinor: 1.5 },
    { reason: '' }, { confirmed: false },
  ]) {
    await refusal(await request(page).post(endpoint, { data: { ...body, amountMinor: 100, ...invalid } }), 400, 'VALIDATION');
    expect(stable(await detail(page, 'pay_9001'))).toEqual(stable(afterPartial));
  }
  await fillRefund(page, '10', 'Replay original partial', key);
  const replayUI = await submitRefund(page);
  expect(replayUI.status).toBe(200);
  expect(replayUI.body.data).toEqual({ case: partial.case, replayed: true });
  const replay = await request(page).post(endpoint, { data: { ...body, amountMinor: 1000, idempotencyKey: key } });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).data).toEqual({ case: partial.case, replayed: true });
  expect(stable(await detail(page, 'pay_9001'))).toEqual(stable(afterPartial));
  await refusal(await request(page).post(endpoint, { data: { ...body, amountMinor: 999, idempotencyKey: key } }), 409, 'CONFLICT');
  expect(stable(await detail(page, 'pay_9001'))).toEqual(stable(afterPartial));
  await fillRefund(page, '40.00', 'E2E full remaining refund', `e2e-full-${crypto.randomUUID()}`);
  const full = await submitRefund(page);
  expect(full.status).toBe(201);
  expect(full.body.data.case.status).toBe('EXECUTED');
  await balanceOnPage(page, '£0.00');
  await shot(page, 'full-refund-and-audit');
  await renderedResult(page, 'pay_9001', '£0.00', ['£40.00', '£10.00'], 'full-refund');
  const afterFull = await detail(page, 'pay_9001');
  expect.soft(afterFull.transaction.refundableMinor).toBe(0);
  expect.soft(afterFull.paymentRefunds).toHaveLength(2);
  expect.soft(afterFull.paymentRefunds.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(5000);
  expect(afterFull.cases).toHaveLength(2);
  expect(accepted(afterFull)).toHaveLength(4);
  expect.soft(await page.getByLabel('Amount (GBP)').count(), 'fully refunded form removed').toBe(0);
  await refusal(await request(page).post(endpoint, { data: { ...body, amountMinor: 1, idempotencyKey: `e2e-after-full-${crypto.randomUUID()}` } }), 412, 'PRECONDITION_FAILED');
  expect(stable(await detail(page, 'pay_9001'))).toEqual(stable(afterFull));
  writeFileSync(evidence('small-refund-state.json'), JSON.stringify({ afterPartial, afterFull, errors }, null, 2));
  expect.soft(errors.unexpected, 'JS pageerrors and unexpected console errors').toEqual([]);
});

test('large request pending, support denied, manager approves once and rejects', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'Money-moving scenario runs once against shared scratch ledger');
  const errors = errorsOn(page);
  await page.goto('/refunds');
  await role(page, 'support');
  await page.goto(detailUrl('pay_9002'));
  const initial = await detail(page, 'pay_9002');
  expect(initial.transaction.refundableMinor).toBe(125000);
  await fillRefund(page, '600', 'E2E high-value refund');
  const pendingResult = await submitRefund(page, true);
  expect(pendingResult.status).toBe(201);
  const pendingCase = pendingResult.body.data.case;
  expect(pendingCase.status).toBe('PENDING_APPROVAL');
  expect(pendingCase.executionRef).toBeNull();
  const pending = await detail(page, 'pay_9002');
  expect(pending.transaction).toEqual(initial.transaction);
  expect(pending.paymentRefunds).toEqual(initial.paymentRefunds);
  expect(accepted(pending).map((a) => a.action)).toEqual(['refunds:request']);
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
  await shot(page, 'support-pending-no-approval-controls');
  for (const action of ['approve', 'reject']) {
    await refusal(await request(page).post(`${endpoint}/cases/${pendingCase.id}/${action}`, { data: { decisionReason: 'Support bypass attempt' } }), 403, 'FORBIDDEN');
    expect(stable(await detail(page, 'pay_9002'))).toEqual(stable(pending));
  }
  await page.reload();
  await shot(page, 'denied-approval-audit');
  await role(page, 'manager-admin');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Execute £600.00 to Beta Ltd');
  await expect(dialog.getByRole('button', { name: 'Approve and refund', exact: true })).toBeDisabled();
  await dialog.getByLabel('Approval note').fill('E2E manager verified request');
  const approvedResponse = page.waitForResponse((r) => r.url().endsWith(`/${pendingCase.id}/approve`));
  let releaseApproval!: () => void;
  const approvalGate = new Promise<void>((resolve) => { releaseApproval = resolve; });
  await page.route(`**/cases/${pendingCase.id}/approve`, async (route) => {
    await approvalGate;
    await route.continue();
  });
  await dialog.getByRole('button', { name: 'Approve and refund', exact: true }).click();
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Approve', exact: true }).scrollIntoViewIfNeeded();
    await shot(page, `approval-in-flight-${width}`);
  }
  releaseApproval();
  expect((await approvedResponse).status()).toBe(200);
  await page.unroute(`**/cases/${pendingCase.id}/approve`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(dialog).not.toBeVisible();
  const approved = await detail(page, 'pay_9002');
  expect(approved.cases[0]).toMatchObject({ status: 'EXECUTED', approvedBy: 'demo_manager-admin', amountMinor: 60000 });
  expect(approved.cases[0].executionRef).toBeTruthy();
  expect(accepted(approved).map((a) => a.action).sort()).toEqual(['refunds:approve', 'refunds:execute', 'refunds:request']);
  expect.soft(approved.transaction.refundableMinor).toBe(65000);
  expect.soft(approved.paymentRefunds).toHaveLength(1);
  await balanceOnPage(page, '£650.00');
  await shot(page, 'manager-approved-and-audit');
  await renderedResult(page, 'pay_9002', '£650.00', ['£600.00'], 'manager-approved');
  await refusal(await request(page).post(`${endpoint}/cases/${pendingCase.id}/approve`, { data: {} }), 409, 'CONFLICT');
  expect(stable(await detail(page, 'pay_9002'))).toEqual(stable(approved));
  await page.goto(detailUrl('pay_9005'));
  const rejectionInitial = await detail(page, 'pay_9005');
  await fillRefund(page, '600', 'E2E request to reject');
  const rejectPending = await submitRefund(page, true);
  expect(rejectPending.status).toBe(201);
  const rejectId = rejectPending.body.data.case.id;
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await dialog.getByLabel('Rejection reason').fill('E2E evidence insufficient');
  const rejectedResponse = page.waitForResponse((r) => r.url().endsWith(`/${rejectId}/reject`));
  await dialog.getByRole('button', { name: 'Reject request', exact: true }).click();
  expect((await rejectedResponse).status()).toBe(200);
  await expect(dialog).not.toBeVisible();
  const rejected = await detail(page, 'pay_9005');
  expect(rejected.cases.find((row) => row.id === rejectId)).toMatchObject({ status: 'REJECTED', executionRef: null, decisionReason: 'E2E evidence insufficient' });
  expect(rejected.transaction).toEqual(rejectionInitial.transaction);
  expect(rejected.paymentRefunds).toEqual(rejectionInitial.paymentRefunds);
  expect(accepted(rejected).map((a) => a.action).sort()).toEqual(['refunds:reject', 'refunds:request']);
  await refusal(await request(page).post(`${endpoint}/cases/${rejectId}/reject`, { data: { decisionReason: 'Retry rejected case' } }), 409, 'CONFLICT');
  expect(stable(await detail(page, 'pay_9005'))).toEqual(stable(rejected));
  await shot(page, 'manager-rejected-and-audit');
  writeFileSync(evidence('approval-state.json'), JSON.stringify({ pending, approved, rejected, errors }, null, 2));
  await fillRefund(page, '700', 'E2E pending across restart');
  const restartPending = await submitRefund(page, true);
  expect(restartPending.status).toBe(201);
  expect(restartPending.body.data.case.status).toBe('PENDING_APPROVAL');
  const restartState = await Promise.all(['pay_9001', 'pay_9002', 'pay_9005'].map((ref) => detail(page, ref)));
  writeFileSync(evidence('restart-before.json'), JSON.stringify(restartState, null, 2));
  expect.soft(errors.unexpected, 'JS pageerrors and unexpected console errors').toEqual([]);
});

test('all new page/API surfaces deny forbidden roles and anonymous sessions without mutation', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'Quiescence check shares the worker with the money-moving tests that mutate these refs');
  const errors = errorsOn(page);
  const observer = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const observerPage = await observer.newPage();
  await observerPage.goto('/');
  await role(observerPage, 'manager-admin');
  const readObserver = async () => {
    const refs = ['pay_9001', 'pay_9002', 'pay_9005'];
    return Promise.all(refs.map(async (ref) => stable(await detail(observerPage, ref))));
  };
  const initial = await readObserver();
  const cases = (await (await request(observerPage).get(endpoint)).json()).data.cases;
  const id = cases[0]?.id ?? 'rfc_nonexistent-auth-probe';
  await page.goto('/');
  for (const actingRole of ['compliance', 'release-engineer', null]) {
    if (actingRole) await role(page, actingRole);
    else await page.context().clearCookies();
    for (const path of ['/refunds', detailUrl('pay_9002')]) {
      await page.goto(path);
      if (actingRole) {
        await expect(page).toHaveURL('/');
        await expect(page.getByRole('heading', { name: 'Operations Console', exact: true })).toBeVisible();
      } else await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
      await expect(page.getByText('Beta Ltd', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Refund Operations', exact: true })).toHaveCount(0);
    }
    await shot(page, `refused-page-${actingRole ?? 'anonymous'}`);
    const status = actingRole ? 403 : 401;
    const code = actingRole ? 'FORBIDDEN' : 'UNAUTHORIZED';
    for (const path of [endpoint, `${endpoint}/transactions?q=pay_9002`, apiDetail('pay_9002')]) {
      await refusal(await request(page).get(path), status, code);
      expect(await readObserver()).toEqual(initial);
    }
    for (const [path, data] of [
      [endpoint, { paymentRef: 'pay_9002', amountMinor: 1, reason: 'Forbidden role bypass', confirmed: true, idempotencyKey: `forbidden-${crypto.randomUUID()}` }],
      [`${endpoint}/cases/${id}/approve`, { decisionReason: 'Forbidden approval' }],
      [`${endpoint}/cases/${id}/reject`, { decisionReason: 'Forbidden rejection' }],
    ] as const) {
      await refusal(await request(page).post(path, { data }), status, code);
      expect(await readObserver()).toEqual(initial);
    }
  }
  await observer.close();
  writeFileSync(evidence('authorization-console.json'), JSON.stringify(errors, null, 2));
  expect.soft(errors.unexpected, 'JS pageerrors and unexpected console errors').toEqual([]);
});

test('workflow and complete audit survive a stopped and restarted server', async ({ page }) => {
  test.skip(!process.env.REFUNDS_RESTART_STATE, 'Run separately after the suite server stops, with REFUNDS_RESTART_STATE=.../restart-before.json');
  const before = JSON.parse(readFileSync(process.env.REFUNDS_RESTART_STATE!, 'utf8')) as TransactionDetail[];
  const errors = errorsOn(page);
  await page.goto('/');
  await role(page, 'manager-admin');
  const after: TransactionDetail[] = [];
  for (const previous of before) {
    const ref = previous.transaction.paymentRef;
    await page.goto(detailUrl(ref));
    const current = await detail(page, ref);
    expect(current.cases).toEqual(previous.cases);
    expect(current.auditTrail).toEqual(previous.auditTrail);
    for (const row of previous.cases) {
      await expect(page.getByRole('table', { name: 'App-owned refund requests for this payment' })).toContainText(row.reason);
      await expect(page.getByRole('table', { name: 'App-owned refund requests for this payment' })).toContainText(row.status.replaceAll('_', ' '));
    }
    await shot(page, `after-restart-${ref}`);
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${ref} populated detail has no document horizontal overflow`).toBe(true);
    if (ref === 'pay_9005') {
      const approve = page.getByRole('button', { name: 'Approve', exact: true });
      await approve.scrollIntoViewIfNeeded();
      await approve.focus();
      await shot(page, 'populated-manager-action-focus');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toContainText('Execute £700.00 to Epsilon AB');
      await shot(page, 'populated-manager-confirmation');
      await page.keyboard.press('Escape');
      await expect.soft(approve).toBeFocused();
    }
    after.push(current);
  }
  writeFileSync(evidence('restart-comparison.json'), JSON.stringify({ before, after }, null, 2));
  expect(errors.unexpected).toEqual([]);
});
