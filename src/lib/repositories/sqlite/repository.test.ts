import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '@/tests/helpers/db';
import { createAuditSink } from './audit';
import { createWorkflowRepository } from './workflow';
import type { AuditSink, WorkflowRepository } from '../types';

describe('WorkflowRepository and AuditSink', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let repo: WorkflowRepository;
  let sink: AuditSink;

  beforeEach(() => {
    ctx = createTestDb();
    repo = createWorkflowRepository(ctx.db);
    sink = createAuditSink(ctx.db);
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('creates and retrieves a KYC workflow case', () => {
    const row = repo.createKycCase({
      id: 'kycwf_test_1',
      providerCaseRef: 'kyc_case_9999',
      customerRef: 'cus_9999',
      status: 'OPEN',
      assigneeId: null,
      openedAt: new Date(0),
      updatedAt: new Date(0),
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
    });

    expect(row.version).toBe(1);
    expect(repo.getKycCaseById(row.id)?.providerCaseRef).toBe('kyc_case_9999');
  });

  it('enforces optimistic concurrency on KYC updates', () => {
    const row = repo.createKycCase({
      id: 'kycwf_test_2',
      providerCaseRef: 'kyc_case_9998',
      customerRef: 'cus_9998',
      status: 'OPEN',
      assigneeId: null,
      openedAt: new Date(0),
      updatedAt: new Date(0),
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
    });

    const stale = repo.updateKycCase(row.id, {
      status: 'APPROVED',
      decidedBy: 'user_1',
      decisionReason: 'Looks good',
      expectedVersion: 1,
    });
    expect(stale.success).toBe(true);

    const conflict = repo.updateKycCase(row.id, {
      status: 'REJECTED',
      expectedVersion: 1,
    });
    expect(conflict.success).toBe(false);
    if (conflict.success) throw new Error('unexpected');
    expect(conflict.error.kind).toBe('OPTIMISTIC_CONCURRENCY');
  });

  it('clears KYC decision metadata when a decided case is reopened', () => {
    const row = repo.createKycCase({
      id: 'kycwf_reopen_1',
      providerCaseRef: 'kyc_case_reopen_1',
      customerRef: 'cus_reopen_1',
      status: 'OPEN',
      assigneeId: null,
      openedAt: new Date(0),
      updatedAt: new Date(0),
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
    });

    const approved = repo.updateKycCase(row.id, {
      status: 'APPROVED',
      decisionReason: 'Looks good',
      decidedBy: 'user_manager_1',
      expectedVersion: 1,
    });
    expect(approved.success).toBe(true);
    if (!approved.success) throw new Error('unexpected');
    expect(approved.row.decidedAt).not.toBeNull();

    const reopened = repo.updateKycCase(row.id, {
      status: 'IN_REVIEW',
      expectedVersion: 2,
    });
    expect(reopened.success).toBe(true);
    if (!reopened.success) throw new Error('unexpected');
    expect(reopened.row.status).toBe('IN_REVIEW');
    expect(reopened.row.decidedAt).toBeNull();
    expect(reopened.row.decidedBy).toBeNull();
    expect(reopened.row.decisionReason).toBeNull();
  });

  it('allows explicit clearing of KYC decision fields without changing status', () => {
    const row = repo.createKycCase({
      id: 'kycwf_clear_fields_1',
      providerCaseRef: 'kyc_case_clear_fields_1',
      customerRef: 'cus_clear_fields_1',
      status: 'OPEN',
      assigneeId: null,
      openedAt: new Date(0),
      updatedAt: new Date(0),
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
    });

    const approved = repo.updateKycCase(row.id, {
      status: 'APPROVED',
      decisionReason: 'Looks good',
      decidedBy: 'user_manager_1',
      expectedVersion: 1,
    });
    expect(approved.success).toBe(true);
    if (!approved.success) throw new Error('unexpected');

    const corrected = repo.updateKycCase(row.id, {
      decisionReason: null,
      decidedBy: null,
      expectedVersion: 2,
    });
    expect(corrected.success).toBe(true);
    if (!corrected.success) throw new Error('unexpected');
    expect(corrected.row.decidedBy).toBeNull();
    expect(corrected.row.decisionReason).toBeNull();
    // Status and decision timestamp remain unchanged.
    expect(corrected.row.status).toBe('APPROVED');
    expect(corrected.row.decidedAt).not.toBeNull();
  });

  it('creates refund cases with unique idempotency keys', () => {
    repo.createRefundCase({
      id: 'rfwf_test_1',
      paymentRef: 'pay_9999',
      customerRef: 'cus_9999',
      amountMinor: 1000,
      currency: 'GBP',
      reason: 'Test refund',
      idempotencyKey: 'idem_test_1',
      status: 'PENDING_APPROVAL',
      requestedBy: 'user_support_1',
      requestedAt: new Date(0),
      approvedBy: null,
      approvedAt: null,
      decisionReason: null,
      executionRef: null,
      updatedAt: new Date(0),
    });

    // Same idempotency key, different id, must be a storage-level conflict.
    expect(() =>
      repo.createRefundCase({
        id: 'rfwf_test_2',
        paymentRef: 'pay_9999',
        customerRef: 'cus_9999',
        amountMinor: 2000,
        currency: 'GBP',
        reason: 'Different',
        idempotencyKey: 'idem_test_1',
        status: 'PENDING_APPROVAL',
        requestedBy: 'user_support_1',
        requestedAt: new Date(0),
        approvedBy: null,
        approvedAt: null,
        decisionReason: null,
        executionRef: null,
        updatedAt: new Date(0),
      }),
    ).toThrow();
  });

  it('writes accepted audit events and reads them by subject', async () => {
    const event = await sink.emit({
      app: 'kyc',
      action: 'kyc:decide',
      actorId: 'user_1',
      actorRole: 'compliance',
      subjectType: 'kyc_case',
      subjectRef: 'kyc_case_9999',
      outcome: 'ACCEPTED',
      reason: 'Approved after review',
      before: { status: 'OPEN' },
      after: { status: 'APPROVED' },
    });

    expect(event.outcome).toBe('ACCEPTED');
    expect(event.beforeJson).toBe(JSON.stringify({ status: 'OPEN' }));

    const history = sink.listForSubject('kyc_case', 'kyc_case_9999');
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(event.id);
  });

  it('clears approvedAt when approvedBy is set to null', () => {
    repo.createRefundCase({
      id: 'rfwf_clear_1',
      paymentRef: 'pay_clear_1',
      customerRef: 'cus_clear_1',
      amountMinor: 1000,
      currency: 'GBP',
      reason: 'Test',
      idempotencyKey: 'idem_clear_1',
      status: 'PENDING_APPROVAL',
      requestedBy: 'user_support_1',
      requestedAt: new Date(0),
      approvedBy: null,
      approvedAt: null,
      decisionReason: null,
      executionRef: null,
      updatedAt: new Date(0),
    });

    const approve = repo.updateRefundCase('rfwf_clear_1', {
      status: 'APPROVED',
      approvedBy: 'user_manager_1',
      expectedVersion: 1,
    });
    expect(approve.success).toBe(true);
    if (!approve.success) throw new Error('unexpected');
    expect(approve.row.approvedAt).not.toBeNull();

    const revoke = repo.updateRefundCase('rfwf_clear_1', {
      approvedBy: null,
      expectedVersion: 2,
    });
    expect(revoke.success).toBe(true);
    if (!revoke.success) throw new Error('unexpected');
    expect(revoke.row.approvedAt).toBeNull();
  });

  it('records denied audit events separately from accepted ones', async () => {
    await sink.emit({
      app: 'refunds',
      action: 'refunds:approve',
      actorId: 'user_1',
      actorRole: 'support',
      subjectType: 'refund_case',
      subjectRef: 'rf_1',
      outcome: 'DENIED',
      reason: 'Role not allowed',
    });

    const accepted = sink.listForSubject('refund_case', 'rf_1').filter(
      (e) => e.outcome === 'ACCEPTED',
    );
    expect(accepted).toHaveLength(0);
  });
});
