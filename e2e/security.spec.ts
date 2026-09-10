import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';

import { closeDb, createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { auditEvents, refundCaseWorkflow } from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';

/**
 * Cross-tool security regression spec for issue #6.
 *
 * The per-tool specs prove each workflow end to end. This file attacks the boundaries
 * they share: forged identity cookies, roles crossing into other apps' APIs, request-body
 * tampering, method confusion, and the rule that a denied call never mutates state or
 * writes an ACCEPTED audit row. Everything runs against the isolated e2e database the
 * playwright web server uses, never the developer demo DB.
 */

const E2E_DB_PATH = './data/e2e.db';
const evidenceDir = 'test-results/security-evidence';

const ROLE_USER: Record<string, string> = {
  support: 'user_sam',
  compliance: 'user_casey',
  'compliance-2': 'user_dana',
  'release-engineer': 'user_riley',
  'manager-admin': 'user_morgan',
};

/** The e2e server signs demo-user cookies with this secret (playwright.config.ts). */
const E2E_SECRET = 'e2e-test-role-secret-do-not-use-in-production';

function signedUserCookie(userId: string): string {
  return `${userId}.${createHmac('sha256', E2E_SECRET).update(userId).digest('base64url')}`;
}

async function actAs(page: Page, userKey: keyof typeof ROLE_USER | (string & {})) {
  const userId = ROLE_USER[userKey] ?? userKey;
  const res = await page.request.post('/api/demo/role', { data: { userId } });
  expect(res.ok()).toBe(true);
}

/** Places a raw demo-user cookie, so a forged value reaches the server like a real one. */
async function setRawDemoUserCookie(page: Page, value: string) {
  await page.context().addCookies([{ name: 'demo-user', value, url: page.url() }]);
}

async function requestFromPage(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown | string },
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, {
        method: init?.method ?? 'GET',
        headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: typeof init?.body === 'string' ? init.body : init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      return { status: response.status, body: await response.text() };
    },
    { path, init },
  );
}

async function refusal(
  response: { status: number; body: string },
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  const body = JSON.parse(response.body);
  expect(body.success).toBe(false);
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  // No stack trace or internals may reach the client.
  expect(response.body).not.toMatch(/stack|node_modules|\.tsx?:\d|at Object\./);
}

/**
 * The e2e server migrates but does not seed: specs that need the seeded cases bring the
 * database up themselves, the same way kyc.spec does. The seed is idempotent, so calling it
 * unconditionally is safe. Retried because the running server holds the WAL.
 */
function ensureSeededDb() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      runMigrations(E2E_DB_PATH);
      const db = createDb(E2E_DB_PATH);
      try {
        seedDatabase(db);
      } finally {
        closeDb(db);
      }
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

function auditRowsFor(subjectRef: string, outcome: 'ACCEPTED' | 'DENIED') {
  const db = createDb(E2E_DB_PATH);
  try {
    return db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectRef, subjectRef), eq(auditEvents.outcome, outcome)))
      .all();
  } finally {
    closeDb(db);
  }
}

/** ACCEPTED rows on one subject written by one actor — race-safe under parallel specs. */
function acceptedCountFor(subjectRef: string, actorId: string): number {
  const db = createDb(E2E_DB_PATH);
  try {
    return db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.subjectRef, subjectRef),
          eq(auditEvents.actorId, actorId),
          eq(auditEvents.outcome, 'ACCEPTED'),
        ),
      )
      .all().length;
  } finally {
    closeDb(db);
  }
}

/** A refund case row with this idempotency key exists only if the request was accepted. */
function refundCaseWithKey(idempotencyKey: string): boolean {
  const db = createDb(E2E_DB_PATH);
  try {
    return db
      .select({ id: refundCaseWorkflow.id })
      .from(refundCaseWorkflow)
      .where(eq(refundCaseWorkflow.idempotencyKey, idempotencyKey))
      .all().length > 0;
  } finally {
    closeDb(db);
  }
}

test.describe('forged identity', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    ensureSeededDb();
  });

  test('unsigned, badly signed, unknown-user and legacy-format cookies all fail closed', async ({
    page,
  }) => {
    await page.goto('/');

    const forgeries: Array<[string, string]> = [
      ['unsigned user id', 'user_morgan'],
      ['garbage signature', 'user_morgan.AAAA'],
      ['signed unknown user id', signedUserCookie('user_eve')],
      ['signed nonexistent user id', signedUserCookie('attacker')],
      ['role name signed as if it were a user id', signedUserCookie('compliance')],
      ['pre-merge demo-role shape', 'manager-admin.AAAA'],
      ['empty value', ''],
    ];

    for (const [label, value] of forgeries) {
      await page.context().clearCookies();
      if (value) await setRawDemoUserCookie(page, value);
      for (const path of ['/api/kyc/cases', '/api/refunds', '/api/flags?environment=dev']) {
        const res = await requestFromPage(page, path);
        expect(res.status, `${label} on ${path}`).toBe(401);
        expect(JSON.parse(res.body).error.code).toBe('UNAUTHORIZED');
      }
    }
  });

  test('a legacy demo-role cookie is ignored entirely', async ({ page }) => {
    await page.goto('/');
    await page.context().addCookies([
      { name: 'demo-role', value: signedUserCookie('user_morgan'), url: page.url() },
    ]);
    const res = await requestFromPage(page, '/api/kyc/cases');
    expect(res.status).toBe(401);
  });
});

test.describe('forbidden cross-app and cross-action calls', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    ensureSeededDb();
  });

  /**
   * Subjects nothing else in the suite mutates: kycwf_0009 (sanctions, unassigned) and
   * kycwf_0011 stay OPEN forever, so holder denials are always 403 and every denied call can
   * be audited per subject without racing parallel specs. refundCreate carries a canary
   * idempotency key — a case row with that key exists only if the request was accepted.
   */
  const CANARY_KEY = `denied-${crypto.randomUUID()}`;
  const targets = {
    kycDecision: { path: '/api/kyc/cases/kycwf_0009/decision', subject: 'kycwf_0009', body: { decision: 'APPROVE', reason: 'bypass', expectedVersion: 1 } },
    kycClaim: { path: '/api/kyc/cases/kycwf_0011/claim', subject: 'kycwf_0011', body: { expectedVersion: 1 } },
    kycEscalate: { path: '/api/kyc/cases/kycwf_0011/escalate', subject: 'kycwf_0011', body: { reason: 'bypass', expectedVersion: 1 } },
    kycRequestInfo: { path: '/api/kyc/cases/kycwf_0011/request-info', subject: 'kycwf_0011', body: { reason: 'bypass', expectedVersion: 1 } },
    refundCreate: { path: '/api/refunds', subject: null, body: { paymentRef: 'pay_9003', amountMinor: 100, reason: 'bypass', idempotencyKey: CANARY_KEY, confirmed: true } },
    refundApprove: { path: '/api/refunds/cases/rfc_never_exists/approve', subject: 'rfc_never_exists', body: { decisionReason: 'bypass' } },
    flagWrite: { path: '/api/flags/risk-scoring-v2', subject: 'flag/dev:risk-scoring-v2', body: { environment: 'dev', enabled: false, reason: 'bypass' } },
  } as const;

  async function expectNoAccepted(subject: string | null, actorId: string, before: number) {
    if (subject === null) {
      expect(refundCaseWithKey(CANARY_KEY)).toBe(false);
      return;
    }
    expect(acceptedCountFor(subject, actorId)).toBe(before);
  }

  for (const { user, denied } of [
    { user: 'support', denied: ['kycDecision', 'kycClaim', 'kycEscalate', 'kycRequestInfo', 'refundApprove', 'flagWrite'] },
    { user: 'compliance', denied: ['kycDecision', 'refundCreate', 'refundApprove', 'flagWrite'] },
    { user: 'release-engineer', denied: ['kycDecision', 'kycClaim', 'kycEscalate', 'kycRequestInfo', 'refundCreate', 'refundApprove'] },
  ] as const) {
    test(`${user} is refused every out-of-role mutation with no ACCEPTED audit`, async ({ page }) => {
      await page.goto('/');
      await actAs(page, user);
      const actorId = ROLE_USER[user];

      for (const name of denied) {
        const target = targets[name];
        const before = target.subject ? acceptedCountFor(target.subject, actorId) : 0;
        const res = await requestFromPage(page, target.path, {
          method: name === 'flagWrite' ? 'PATCH' : 'POST',
          body: target.body,
        });
        await refusal(res, 403, 'FORBIDDEN');
        await expectNoAccepted(target.subject, actorId, before);
      }
    });
  }

  test('anonymous sessions are refused every mutation surface', async ({ page }) => {
    await page.goto('/');
    for (const [name, target] of Object.entries(targets)) {
      const method = name === 'flagWrite' ? 'PATCH' : 'POST';
      await refusal(await requestFromPage(page, target.path, { method, body: target.body }), 401, 'UNAUTHORIZED');
    }
    // Anonymous calls never reach the service: nothing may have been written anywhere.
    for (const target of Object.values(targets)) {
      if (target.subject) {
        expect(auditRowsFor(target.subject, 'ACCEPTED').length).toBe(0);
      }
    }
    expect(refundCaseWithKey(CANARY_KEY)).toBe(false);
  });
});

test.describe('request-body tampering', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    ensureSeededDb();
  });

  test('identity fields in a refund body are ignored; the cookie actor is audited', async ({ page }) => {
    await page.goto('/');
    await actAs(page, 'support');
    const key = `tamper-${crypto.randomUUID()}`;
    const res = await requestFromPage(page, '/api/refunds', {
      method: 'POST',
      body: {
        paymentRef: 'pay_9003',
        amountMinor: 100,
        reason: 'tamper probe',
        idempotencyKey: key,
        confirmed: true,
        role: 'manager-admin',
        actorId: 'user_morgan',
        approvedBy: 'user_morgan',
      },
    });
    expect(res.status).toBe(201);
    const created = JSON.parse(res.body).data.case;
    const rows = auditRowsFor(created.id, 'ACCEPTED');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actorId).toBe('user_sam');
      expect(row.actorRole).toBe('support');
    }
  });

  test('malformed and coerced refund bodies are refused without mutation', async ({ page }) => {
    await page.goto('/');
    await actAs(page, 'support');
    const before = (await requestFromPage(page, '/api/refunds/transactions/pay_9003')).body;
    const canary = `tamper-${crypto.randomUUID()}`;

    for (const [i, body] of [
      { paymentRef: 'pay_9003', amountMinor: '100', reason: 'x', idempotencyKey: `${canary}-1`, confirmed: true },
      { paymentRef: 'pay_9003', amountMinor: -5, reason: 'x', idempotencyKey: `${canary}-2`, confirmed: true },
      { paymentRef: 'pay_9003', amountMinor: 1.5, reason: 'x', idempotencyKey: `${canary}-3`, confirmed: true },
      { paymentRef: 'pay_9003', amountMinor: 99999, reason: 'x', idempotencyKey: `${canary}-4`, confirmed: true },
      { paymentRef: 'pay_9003', amountMinor: 100, reason: 'x', idempotencyKey: `${canary}-5`, confirmed: false },
      { paymentRef: 'pay_9003', amountMinor: 100, reason: 'x', idempotencyKey: `${canary}-6` },
      { paymentRef: 'pay_nope', amountMinor: 100, reason: 'x', idempotencyKey: `${canary}-7`, confirmed: true },
    ].entries()) {
      const res = await requestFromPage(page, '/api/refunds', { method: 'POST', body });
      expect([400, 404, 412], `body ${i + 1}`).toContain(res.status);
      expect(JSON.parse(res.body).success).toBe(false);
      expect(refundCaseWithKey(`${canary}-${i + 1}`)).toBe(false);
    }
    const malformed = await requestFromPage(page, '/api/refunds', { method: 'POST', body: 'not-json{' });
    await refusal(malformed, 400, 'VALIDATION');

    expect((await requestFromPage(page, '/api/refunds/transactions/pay_9003')).body).toBe(before);
  });

  test('flag writes refuse environment spoofing and extra dimensions', async ({ page }) => {
    await page.goto('/');
    await actAs(page, 'release-engineer');
    const before = JSON.parse((await requestFromPage(page, '/api/flags/risk-scoring-v2?environment=dev')).body).data.flag;

    for (const body of [
      { environment: 'prod', enabled: false },
      { environment: 'PRODUCTION', enabled: false },
      { enabled: false },
      { environment: 'dev', enabled: true, rolloutPercentage: 50 },
      { environment: 'dev', rolloutPercentage: 101 },
      { environment: 'dev', rolloutPercentage: '50' },
    ]) {
      const res = await requestFromPage(page, '/api/flags/risk-scoring-v2', { method: 'PATCH', body });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION');
    }
    const after = JSON.parse((await requestFromPage(page, '/api/flags/risk-scoring-v2?environment=dev')).body).data.flag;
    expect(after.enabled).toBe(before.enabled);
    expect(after.rolloutPercentage).toBe(before.rolloutPercentage);
  });

  test('a release engineer cannot reach production even with a perfect body', async ({ page }) => {
    await page.goto('/');
    await actAs(page, 'release-engineer');
    const res = await requestFromPage(page, '/api/flags/risk-scoring-v2', {
      method: 'PATCH',
      body: { environment: 'production', enabled: true, reason: 'bypass', confirmation: 'risk-scoring-v2' },
    });
    const before = JSON.parse((await requestFromPage(page, '/api/flags/risk-scoring-v2?environment=production')).body).data.flag;
    await refusal(res, 403, 'FORBIDDEN');
    const after = JSON.parse((await requestFromPage(page, '/api/flags/risk-scoring-v2?environment=production')).body).data.flag;
    expect(after.enabled).toBe(before.enabled);
    expect(after.rolloutPercentage).toBe(before.rolloutPercentage);
  });

  test('kyc decision bodies cannot inject assignee, decider or invented versions', async ({ page }, info) => {
    const caseId = info.project.name === 'mobile-375' ? 'kycwf_0011' : 'kycwf_0009';
    await page.goto('/');
    await actAs(page, 'compliance-2');

    // Dana does not hold the case: a body claiming she does changes nothing.
    const res = await requestFromPage(page, `/api/kyc/cases/${caseId}/decision`, {
      method: 'POST',
      body: {
        decision: 'APPROVE',
        reason: 'bypass',
        expectedVersion: 1,
        assigneeId: 'user_dana',
        decidedBy: 'user_dana',
        actorId: 'user_morgan',
      },
    });
    await refusal(res, 403, 'FORBIDDEN');
    const detail = JSON.parse((await requestFromPage(page, `/api/kyc/cases/${caseId}`)).body).data;
    expect(detail.workflow.assigneeId).not.toBe('user_dana');
    expect(detail.workflow.status).not.toBe('APPROVED');
    expect(auditRowsFor(caseId, 'ACCEPTED').filter((r) => r.action === 'kyc:decide')).toEqual([]);
  });
});

test.describe('surface hygiene', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    ensureSeededDb();
  });

  test('there is no app-owned /audit surface and no /api/audit', async ({ page }) => {
    await page.goto('/');
    await actAs(page, 'manager-admin');
    for (const path of ['/api/audit', '/api/audit/events']) {
      const res = await requestFromPage(page, path);
      expect(res.status).toBe(404);
    }
    await page.goto('/audit');
    await expect(page.getByText('404', { exact: false }).first()).toBeVisible();
  });

  test('wrong HTTP methods on mutation routes are refused', async ({ page }) => {
    await page.goto('/');
    await actAs(page, 'manager-admin');
    for (const [method, path] of [
      ['GET', '/api/kyc/cases/kycwf_0001/decision'],
      ['GET', '/api/kyc/cases/kycwf_0001/claim'],
      ['DELETE', '/api/kyc/cases/kycwf_0001'],
      ['PUT', '/api/refunds'],
      ['POST', '/api/refunds/transactions/pay_9003'],
    ] as const) {
      const res = await requestFromPage(page, path, { method });
      expect(res.status).toBe(405);
    }
  });
});

test.describe('evidence', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    ensureSeededDb();
  });

  test('writes the security probe summary', async ({ page }, info) => {
    mkdirSync(join(evidenceDir, info.project.name), { recursive: true });
    await page.goto('/');
    await actAs(page, 'manager-admin');
    const res = await requestFromPage(page, '/api/kyc/cases');
    const cases = JSON.parse(res.body).data.cases.length;
    const audits = auditRowsFor('kycwf_0007', 'ACCEPTED').length;
    writeFileSync(
      join(evidenceDir, info.project.name, 'probe-summary.json'),
      JSON.stringify({ at: new Date().toISOString(), project: info.project.name, kycCases: cases, kycwf0007AcceptedAuditRows: audits }, null, 2),
    );
    expect(cases).toBeGreaterThan(0);
  });
});
