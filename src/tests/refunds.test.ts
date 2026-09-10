// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Actor } from '@/lib/auth/session';
import { refundsPaymentsConnector } from '@/features/refunds/payments';
import { createRefundService, type RefundService } from '@/features/refunds/service';
import { customerConnector } from '@/lib/integrations/mock/customers';
import { resetMockPayments } from '@/lib/integrations/mock/payments';
import { createAuditSink } from '@/lib/repositories/sqlite/audit';
import { createWorkflowRepository } from '@/lib/repositories/sqlite/workflow';
import type { AuditSink } from '@/lib/repositories/types';

import { createTestDb } from './helpers/db';

/**
 * Refund operations (#3).
 *
 * The negative paths matter more than the happy ones here: an excessive amount, a replayed
 * idempotency key, a large refund and a forbidden caller must each leave the payments system
 * untouched and must never produce an ACCEPTED audit row.
 */

const SUPPORT: Actor = { id: 'user_support_1', role: 'support', displayName: 'Sam Support' };
const MANAGER: Actor = { id: 'user_manager_1', role: 'manager-admin', displayName: 'Morgan Manager' };
const COMPLIANCE: Actor = { id: 'user_compliance_1', role: 'compliance', displayName: 'Casey Compliance' };

/** pay_9001: £50.00 captured, fully refundable — below the £500 approval threshold. */
const SMALL_PAYMENT = 'pay_9001';
/** pay_9002: £1,250.00 captured, fully refundable — above the threshold. */
const LARGE_PAYMENT = 'pay_9002';

let ctx: ReturnType<typeof createTestDb>;
let service: RefundService;
let audit: AuditSink;
let caseCounter: number;

function acceptedAudit(subjectRef: string) {
  return audit.listForSubject('refund_case', subjectRef).filter((row) => row.outcome === 'ACCEPTED');
}

function refundableOf(paymentRef: string): number {
  return refundsPaymentsConnector.getTransaction(paymentRef)!.refundableMinor;
}

beforeEach(() => {
  ctx = createTestDb();
  resetMockPayments();
  caseCounter = 0;
  audit = createAuditSink(ctx.db);
  service = createRefundService({
    payments: refundsPaymentsConnector,
    customers: customerConnector,
    workflow: createWorkflowRepository(ctx.db),
    audit,
    newId: () => `rfc_test_${++caseCounter}`,
  });
});

afterEach(() => {
  ctx.cleanup();
  vi.restoreAllMocks();
});

describe('search', () => {
  it('finds transactions by customer name, email domain and payment reference', () => {
    expect(service.searchTransactions('Acme').map((t) => t.paymentRef)).toContain(SMALL_PAYMENT);
    expect(service.searchTransactions('ops@acme.example').map((t) => t.paymentRef)).toContain(SMALL_PAYMENT);
    expect(service.searchTransactions(SMALL_PAYMENT).map((t) => t.paymentRef)).toEqual([SMALL_PAYMENT]);
    expect(service.searchTransactions('cus_1002').map((t) => t.paymentRef)).toEqual([LARGE_PAYMENT]);
    expect(service.searchTransactions('no-such-customer')).toEqual([]);
  });

  it('reports the remaining refundable balance rather than the captured amount', () => {
    const [partiallyRefunded] = service.searchTransactions('pay_9004');
    expect(partiallyRefunded.amountMinor).toBe(75000);
    expect(partiallyRefunded.refundableMinor).toBe(50000);
  });

  it('shows the payment system refund history separately from app audit', () => {
    const detail = service.getTransactionDetail('pay_9004');
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;

    expect(detail.value.paymentRefunds).toHaveLength(1);
    expect(detail.value.paymentRefunds[0].amountMinor).toBe(25000);
    expect(detail.value.auditTrail).toHaveLength(0);
  });
});

describe('requesting a refund', () => {
  it('executes a full refund for Support and records it as EXECUTED', async () => {
    const result = await service.requestRefund(SUPPORT, {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 5000,
      reason: 'Duplicate charge',
      idempotencyKey: 'key-full',
      confirmed: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.case.status).toBe('EXECUTED');
    expect(result.value.case.executionRef).toBe('rfexec_key-full');
    expect(refundableOf(SMALL_PAYMENT)).toBe(0);

    const actions = acceptedAudit(result.value.case.id).map((row) => row.action);
    expect(actions).toContain('refunds:request');
    expect(actions).toContain('refunds:execute');
  });

  it('executes a partial refund and leaves the rest refundable', async () => {
    const result = await service.requestRefund(SUPPORT, {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 1500,
      reason: 'Goodwill',
      idempotencyKey: 'key-partial',
      confirmed: true,
    });

    expect(result.ok).toBe(true);
    expect(refundableOf(SMALL_PAYMENT)).toBe(3500);
  });

  it('refuses an amount above the refundable balance without touching the payment', async () => {
    const result = await service.requestRefund(SUPPORT, {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 5001,
      reason: 'Too much',
      idempotencyKey: 'key-excessive',
      confirmed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(refundableOf(SMALL_PAYMENT)).toBe(5000);
    expect(service.listCases()).toHaveLength(0);
    expect(refundsPaymentsConnector.listRefunds(SMALL_PAYMENT)).toHaveLength(0);
  });

  it('refuses an amount above the balance left by an earlier partial refund', async () => {
    await service.requestRefund(SUPPORT, {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 3000,
      reason: 'First partial',
      idempotencyKey: 'key-first',
      confirmed: true,
    });

    const second = await service.requestRefund(SUPPORT, {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 2500,
      reason: 'Second partial',
      idempotencyKey: 'key-second',
      confirmed: true,
    });

    expect(second.ok).toBe(false);
    expect(refundableOf(SMALL_PAYMENT)).toBe(2000);
    expect(refundsPaymentsConnector.listRefunds(SMALL_PAYMENT)).toHaveLength(1);
  });

  it('issues exactly one refund when the same idempotency key is replayed', async () => {
    const input = {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 2000,
      reason: 'Retry after timeout',
      idempotencyKey: 'key-replay',
      confirmed: true as const,
    };

    const first = await service.requestRefund(SUPPORT, input);
    const second = await service.requestRefund(SUPPORT, input);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.value.replayed).toBe(true);
    expect(second.value.case.id).toBe(first.value.case.id);
    expect(service.listCases()).toHaveLength(1);
    expect(refundsPaymentsConnector.listRefunds(SMALL_PAYMENT)).toHaveLength(1);
    expect(refundableOf(SMALL_PAYMENT)).toBe(3000);
  });

  it('rejects a reused idempotency key that describes a different refund', async () => {
    await service.requestRefund(SUPPORT, {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 2000,
      reason: 'Original',
      idempotencyKey: 'key-conflict',
      confirmed: true,
    });

    const conflicting = await service.requestRefund(SUPPORT, {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 2500,
      reason: 'Different amount, same key',
      idempotencyKey: 'key-conflict',
      confirmed: true,
    });

    expect(conflicting.ok).toBe(false);
    if (conflicting.ok) return;
    expect(conflicting.error.code).toBe('CONFLICT');
    expect(refundsPaymentsConnector.listRefunds(SMALL_PAYMENT)).toHaveLength(1);
  });

  it('forbids a role without refunds:request and creates nothing', async () => {
    const result = await service.requestRefund(COMPLIANCE, {
      paymentRef: SMALL_PAYMENT,
      amountMinor: 1000,
      reason: 'Not my app',
      idempotencyKey: 'key-forbidden',
      confirmed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('FORBIDDEN');
    expect(service.listCases()).toHaveLength(0);
    expect(refundableOf(SMALL_PAYMENT)).toBe(5000);

    const events = audit.listForSubject('payment', SMALL_PAYMENT);
    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe('DENIED');
  });
});

describe('large refunds', () => {
  async function requestLarge(idempotencyKey = 'key-large') {
    const result = await service.requestRefund(SUPPORT, {
      paymentRef: LARGE_PAYMENT,
      amountMinor: 60000,
      reason: 'Cancelled annual plan',
      idempotencyKey,
      confirmed: true,
    });
    if (!result.ok) throw new Error(`expected the large request to be accepted: ${result.error.message}`);
    return result.value.case;
  }

  it('holds a refund over £500 as PENDING_APPROVAL without any payment mutation', async () => {
    const refundCase = await requestLarge();

    expect(refundCase.status).toBe('PENDING_APPROVAL');
    expect(refundCase.executionRef).toBeNull();
    expect(refundableOf(LARGE_PAYMENT)).toBe(125000);
    expect(refundsPaymentsConnector.listRefunds(LARGE_PAYMENT)).toHaveLength(0);

    const actions = acceptedAudit(refundCase.id).map((row) => row.action);
    expect(actions).toEqual(['refunds:request']);
  });

  it('executes exactly once when a Manager/Admin approves', async () => {
    const refundCase = await requestLarge();

    const approved = await service.approveRefund(MANAGER, refundCase.id, 'Verified with the customer');
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;

    expect(approved.value.case.status).toBe('EXECUTED');
    expect(approved.value.case.approvedBy).toBe(MANAGER.id);
    expect(refundsPaymentsConnector.listRefunds(LARGE_PAYMENT)).toHaveLength(1);
    expect(refundableOf(LARGE_PAYMENT)).toBe(65000);

    const actions = acceptedAudit(refundCase.id).map((row) => row.action);
    expect(actions).toContain('refunds:approve');
    expect(actions).toContain('refunds:execute');
  });

  it('does not execute a second refund when an executed case is approved again', async () => {
    const refundCase = await requestLarge();
    await service.approveRefund(MANAGER, refundCase.id, 'First approval');

    const again = await service.approveRefund(MANAGER, refundCase.id, 'Double click');

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe('CONFLICT');
    expect(refundsPaymentsConnector.listRefunds(LARGE_PAYMENT)).toHaveLength(1);
    expect(refundableOf(LARGE_PAYMENT)).toBe(65000);
  });

  it('forbids approval by a role without refunds:approve and moves no money', async () => {
    const refundCase = await requestLarge();

    const attempt = await service.approveRefund(SUPPORT, refundCase.id, 'Approving my own request');

    expect(attempt.ok).toBe(false);
    if (attempt.ok) return;
    expect(attempt.error.code).toBe('FORBIDDEN');
    expect(refundsPaymentsConnector.listRefunds(LARGE_PAYMENT)).toHaveLength(0);
    expect(refundableOf(LARGE_PAYMENT)).toBe(125000);

    const stored = service.getCase(refundCase.id);
    expect(stored.ok && stored.value.refundCase.status).toBe('PENDING_APPROVAL');

    const approveEvents = audit
      .listForSubject('refund_case', refundCase.id)
      .filter((row) => row.action === 'refunds:approve');
    expect(approveEvents).toHaveLength(1);
    expect(approveEvents[0].outcome).toBe('DENIED');
  });

  it('records a rejection without calling the payments system', async () => {
    const refundCase = await requestLarge();

    const rejected = await service.rejectRefund(MANAGER, refundCase.id, 'Chargeback already raised');

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.value.case.status).toBe('REJECTED');
    expect(refundsPaymentsConnector.listRefunds(LARGE_PAYMENT)).toHaveLength(0);
    expect(refundableOf(LARGE_PAYMENT)).toBe(125000);
  });
});

/**
 * Route-level checks. The UI hides what a role cannot do, but the API is the real boundary,
 * so these call the handlers directly with a forged session.
 */
describe('API authorization', () => {
  const currentActor: { value: Actor | null } = { value: null };

  beforeEach(() => {
    currentActor.value = null;
    vi.resetModules();
    vi.doMock('@/lib/auth/session', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/auth/session')>()),
      getCurrentUser: async () => currentActor.value,
    }));
    vi.doMock('@/features/refunds/server', () => ({ getRefundService: () => service }));
  });

  async function postRefund(body: unknown) {
    const { POST } = await import('@/app/api/refunds/route');
    return POST(
      new Request('http://localhost/api/refunds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  const validBody = {
    paymentRef: SMALL_PAYMENT,
    amountMinor: 1000,
    reason: 'Direct API call',
    idempotencyKey: 'key-api',
    confirmed: true,
  };

  it('rejects an unauthenticated refund request with 401 and no mutation', async () => {
    const response = await postRefund(validBody);

    expect(response.status).toBe(401);
    expect(service.listCases()).toHaveLength(0);
    expect(refundableOf(SMALL_PAYMENT)).toBe(5000);
  });

  it('rejects a direct refund request from a role without refunds access with 403', async () => {
    currentActor.value = COMPLIANCE;

    const response = await postRefund(validBody);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('FORBIDDEN');
    expect(service.listCases()).toHaveLength(0);
    expect(refundsPaymentsConnector.listRefunds(SMALL_PAYMENT)).toHaveLength(0);
  });

  it('rejects an approval from a role that can open the app but cannot approve', async () => {
    currentActor.value = SUPPORT;

    const requested = await service.requestRefund(SUPPORT, {
      paymentRef: LARGE_PAYMENT,
      amountMinor: 60000,
      reason: 'Large request',
      idempotencyKey: 'key-api-large',
      confirmed: true,
    });
    if (!requested.ok) throw new Error('expected the large request to be accepted');

    const { POST } = await import('@/app/api/refunds/cases/[id]/approve/route');
    const response = await POST(
      new Request('http://localhost/api/refunds/cases/x/approve', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ id: requested.value.case.id }) },
    );

    expect(response.status).toBe(403);
    expect(refundsPaymentsConnector.listRefunds(LARGE_PAYMENT)).toHaveLength(0);
    expect(refundableOf(LARGE_PAYMENT)).toBe(125000);
  });

  it('accepts a valid Support refund request through the API', async () => {
    currentActor.value = SUPPORT;

    const response = await postRefund(validBody);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data.case.status).toBe('EXECUTED');
    expect(refundableOf(SMALL_PAYMENT)).toBe(4000);
  });

  it('validates the request body before reaching the payments system', async () => {
    currentActor.value = SUPPORT;

    const response = await postRefund({ ...validBody, amountMinor: 12.5 });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('VALIDATION');
    expect(refundsPaymentsConnector.listRefunds(SMALL_PAYMENT)).toHaveLength(0);
  });
});
