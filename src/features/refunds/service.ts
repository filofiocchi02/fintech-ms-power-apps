import { requireActionPermission } from '@/lib/auth/guards';
import type { Actor } from '@/lib/auth/session';
import {
  conflictError,
  forbiddenError,
  notFoundError,
  preconditionError,
  unauthorizedError,
  validationError,
  type AppError,
} from '@/lib/errors/errors';
import type { Customer, CustomerConnector, PaymentTransaction } from '@/lib/integrations/types';
import type {
  AuditEventInput,
  AuditEventRow,
  AuditSink,
  RefundCase,
  WorkflowRepository,
} from '@/lib/repositories/types';

import type { RefundsPaymentsConnector } from './payments';
import { requiresApproval } from './policy';
import type { CreateRefundRequest } from './schemas';

/**
 * Refund workflow logic.
 *
 * The split this file has to keep honest:
 *
 * - `PaymentsConnector` owns the money. Balances, refund history and idempotency are read
 *   from and enforced by it; nothing here caches a balance or decides that a refund "must
 *   have worked".
 * - `WorkflowRepository` owns who asked for what, who approved it, and when. It stores
 *   references and the app's own approval state, never authoritative payment state.
 * - `AuditSink` records what an operator did in this tool, separately from the payments
 *   system's financial history.
 *
 * Dependencies are injected so tests drive the same code path the routes do.
 */

export interface RefundServiceDeps {
  payments: RefundsPaymentsConnector;
  customers: CustomerConnector;
  workflow: WorkflowRepository;
  audit: AuditSink;
  now?: () => Date;
  newId?: () => string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

/** Serialisable projections. Dates cross the server/client boundary as ISO strings. */
export interface TransactionSummary {
  paymentRef: string;
  customerRef: string;
  customerName: string;
  customerEmailDomain: string;
  amountMinor: number;
  refundableMinor: number;
  currency: string;
  status: PaymentTransaction['status'];
  capturedAt: string;
  /** True when refunding the whole remaining balance would need Manager/Admin approval. */
  fullRefundRequiresApproval: boolean;
}

export interface RefundHistoryEntry {
  refundRef: string;
  amountMinor: number;
  currency: string;
  executedAt: string;
  channel: 'internal-tool' | 'psp-console';
}

export interface RefundCaseSummary {
  id: string;
  paymentRef: string;
  customerRef: string;
  customerName: string;
  amountMinor: number;
  currency: string;
  status: RefundCase['status'];
  reason: string;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  decisionReason: string | null;
  executionRef: string | null;
}

export interface TransactionDetail {
  transaction: TransactionSummary;
  /** Financial history from the payments system. */
  paymentRefunds: RefundHistoryEntry[];
  /** App-owned refund requests against this payment. */
  cases: RefundCaseSummary[];
  /** Internal-tool audit for those requests. Not financial history. */
  auditTrail: AuditEventRow[];
}

export interface RequestRefundOutcome {
  case: RefundCaseSummary;
  /** True when an existing idempotency key was replayed and nothing new was executed. */
  replayed: boolean;
}

const AUDIT_SUBJECT_CASE = 'refund_case';
const AUDIT_SUBJECT_PAYMENT = 'payment';

export interface RefundService {
  searchTransactions(query: string): TransactionSummary[];
  getTransactionDetail(paymentRef: string): Result<TransactionDetail>;
  listCases(): RefundCaseSummary[];
  getCase(id: string): Result<{ refundCase: RefundCaseSummary; auditTrail: AuditEventRow[] }>;
  requestRefund(actor: Actor | null, input: CreateRefundRequest): Promise<Result<RequestRefundOutcome>>;
  approveRefund(actor: Actor | null, caseId: string, decisionReason?: string): Promise<Result<RequestRefundOutcome>>;
  rejectRefund(actor: Actor | null, caseId: string, decisionReason: string): Promise<Result<RequestRefundOutcome>>;
}

export function createRefundService(deps: RefundServiceDeps): RefundService {
  const { payments, customers, workflow, audit } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => `rfc_${crypto.randomUUID()}`);

  function customerFor(ref: string): Customer | null {
    return customers.getCustomer(ref);
  }

  function toSummary(tx: PaymentTransaction): TransactionSummary {
    const customer = customerFor(tx.customerRef);
    return {
      paymentRef: tx.paymentRef,
      customerRef: tx.customerRef,
      customerName: customer?.displayName ?? 'Unknown customer',
      customerEmailDomain: customer?.emailDomain ?? '',
      amountMinor: tx.amountMinor,
      refundableMinor: tx.refundableMinor,
      currency: tx.currency,
      status: tx.status,
      capturedAt: tx.capturedAt.toISOString(),
      fullRefundRequiresApproval: requiresApproval(tx.refundableMinor),
    };
  }

  function toCaseSummary(row: RefundCase): RefundCaseSummary {
    return {
      id: row.id,
      paymentRef: row.paymentRef,
      customerRef: row.customerRef,
      customerName: customerFor(row.customerRef)?.displayName ?? 'Unknown customer',
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status,
      reason: row.reason,
      requestedBy: row.requestedBy,
      requestedAt: row.requestedAt.toISOString(),
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
      decisionReason: row.decisionReason,
      executionRef: row.executionRef,
    };
  }

  function auditFor(subjectType: string, subjectRef: string): AuditEventRow[] {
    return audit.listForSubject(subjectType, subjectRef);
  }

  async function emit(event: Omit<AuditEventInput, 'app'>): Promise<void> {
    await audit.emit({ app: 'refunds', ...event });
  }

  function denied(actor: Actor | null, action: 'refunds:request' | 'refunds:approve'):
    | { allowed: true; actor: Actor }
    | { allowed: false; error: AppError } {
    const check = requireActionPermission(actor, action);
    if (check.allowed) return { allowed: true, actor: check.actor };
    return {
      allowed: false,
      error: actor
        ? forbiddenError(`Action ${action} is not permitted for ${actor.role}`)
        : unauthorizedError(),
    };
  }

  return {
    /**
     * Server-side search over the payments system by customer name, email domain, payment
     * reference or customer reference.
     *
     * `PaymentsConnector` exposes refundable transactions plus a lookup by reference, so an
     * exact reference still finds a fully-refunded payment that the refundable list omits.
     */
    searchTransactions(query: string): TransactionSummary[] {
      const q = query.trim().toLowerCase();
      const found = new Map<string, PaymentTransaction>();

      for (const tx of payments.listRefundableTransactions()) {
        found.set(tx.paymentRef, tx);
      }
      if (q) {
        const exact = payments.getTransaction(query.trim());
        if (exact) found.set(exact.paymentRef, exact);
      }

      const all = [...found.values()].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
      if (!q) return all.map(toSummary);

      // An operator often pastes a whole address; match on the domain part.
      const domain = q.includes('@') ? q.slice(q.indexOf('@') + 1) : q;

      return all
        .filter((tx) => {
          const customer = customerFor(tx.customerRef);
          return (
            tx.paymentRef.toLowerCase().includes(q) ||
            tx.customerRef.toLowerCase().includes(q) ||
            (customer?.displayName.toLowerCase().includes(q) ?? false) ||
            (customer?.emailDomain.toLowerCase().includes(domain) ?? false)
          );
        })
        .map(toSummary);
    },

    getTransactionDetail(paymentRef: string): Result<TransactionDetail> {
      const tx = payments.getTransaction(paymentRef);
      if (!tx) return { ok: false, error: notFoundError('Transaction not found') };

      const cases = workflow
        .listRefundCases()
        .filter((row) => row.paymentRef === paymentRef)
        .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());

      return {
        ok: true,
        value: {
          transaction: toSummary(tx),
          paymentRefunds: payments.listRefunds(paymentRef).map((refund) => ({
            refundRef: refund.refundRef,
            amountMinor: refund.amountMinor,
            currency: refund.currency,
            executedAt: refund.executedAt.toISOString(),
            channel: refund.channel,
          })),
          cases: cases.map(toCaseSummary),
          auditTrail: cases.flatMap((row) => auditFor(AUDIT_SUBJECT_CASE, row.id)),
        },
      };
    },

    listCases(): RefundCaseSummary[] {
      return workflow
        .listRefundCases()
        .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
        .map(toCaseSummary);
    },

    getCase(id) {
      const row = workflow.getRefundCaseById(id);
      if (!row) return { ok: false, error: notFoundError('Refund case not found') };
      return {
        ok: true,
        value: { refundCase: toCaseSummary(row), auditTrail: auditFor(AUDIT_SUBJECT_CASE, id) },
      };
    },

    /**
     * Requests a refund.
     *
     * At or below the approval threshold the payments connector is called exactly once for
     * a new idempotency key. Above it, the request is only recorded as PENDING_APPROVAL and
     * no money moves until a Manager/Admin approves.
     */
    async requestRefund(actor, input) {
      const permission = denied(actor, 'refunds:request');
      if (!permission.allowed) {
        if (actor) {
          await emit({
            action: 'refunds:request',
            actorId: actor.id,
            actorRole: actor.role,
            subjectType: AUDIT_SUBJECT_PAYMENT,
            subjectRef: input.paymentRef,
            outcome: 'DENIED',
            reason: 'Actor lacks refunds:request',
          });
        }
        return { ok: false, error: permission.error };
      }
      const requester = permission.actor;

      // A replayed submit must never produce a second request or a second payment call.
      const existing = workflow.getRefundCaseByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        if (existing.paymentRef !== input.paymentRef || existing.amountMinor !== input.amountMinor) {
          return {
            ok: false,
            error: conflictError('Idempotency key already used for a different refund'),
          };
        }
        return { ok: true, value: { case: toCaseSummary(existing), replayed: true } };
      }

      const tx = payments.getTransaction(input.paymentRef);
      if (!tx) return { ok: false, error: notFoundError('Transaction not found') };
      if (tx.status !== 'captured') {
        return { ok: false, error: preconditionError('Transaction is not refundable') };
      }
      if (input.amountMinor > tx.refundableMinor) {
        return {
          ok: false,
          error: validationError('Refund exceeds the remaining refundable balance', {
            amountMinor: `Maximum refundable is ${tx.refundableMinor} minor units`,
          }),
        };
      }

      const pending = requiresApproval(input.amountMinor);
      const timestamp = now();
      const created = workflow.createRefundCase({
        id: newId(),
        paymentRef: tx.paymentRef,
        customerRef: tx.customerRef,
        amountMinor: input.amountMinor,
        currency: tx.currency,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        status: pending ? 'PENDING_APPROVAL' : 'APPROVED',
        requestedBy: requester.id,
        requestedAt: timestamp,
        approvedBy: null,
        approvedAt: null,
        decisionReason: null,
        executionRef: null,
        updatedAt: timestamp,
      });

      await emit({
        action: 'refunds:request',
        actorId: requester.id,
        actorRole: requester.role,
        subjectType: AUDIT_SUBJECT_CASE,
        subjectRef: created.id,
        outcome: 'ACCEPTED',
        reason: input.reason,
        after: {
          status: created.status,
          amountMinor: created.amountMinor,
          currency: created.currency,
          paymentRef: created.paymentRef,
          requiresApproval: pending,
        },
      });

      if (pending) {
        return { ok: true, value: { case: toCaseSummary(created), replayed: false } };
      }

      const executed = await executeCase(created, requester, null);
      return executed;
    },

    /** Manager/Admin approval. This is the one place a large refund reaches the payments system. */
    async approveRefund(actor, caseId, decisionReason) {
      const permission = denied(actor, 'refunds:approve');
      if (!permission.allowed) {
        if (actor) {
          await emit({
            action: 'refunds:approve',
            actorId: actor.id,
            actorRole: actor.role,
            subjectType: AUDIT_SUBJECT_CASE,
            subjectRef: caseId,
            outcome: 'DENIED',
            reason: 'Actor lacks refunds:approve',
          });
        }
        return { ok: false, error: permission.error };
      }
      const approver = permission.actor;

      const row = workflow.getRefundCaseById(caseId);
      if (!row) return { ok: false, error: notFoundError('Refund case not found') };
      if (row.status === 'EXECUTED') {
        return { ok: false, error: conflictError('Refund has already been executed') };
      }
      if (row.status !== 'PENDING_APPROVAL') {
        return { ok: false, error: conflictError(`Refund case is ${row.status}`) };
      }

      // Claim the case before touching the payments system, so two concurrent approvals
      // cannot both reach executeRefund.
      const claimed = workflow.updateRefundCase(row.id, {
        status: 'APPROVED',
        approvedBy: approver.id,
        approvedAt: now(),
        decisionReason: decisionReason ?? null,
        expectedVersion: row.version,
      });
      if (!claimed.success) {
        return { ok: false, error: conflictError('Refund case changed while being approved') };
      }

      await emit({
        action: 'refunds:approve',
        actorId: approver.id,
        actorRole: approver.role,
        subjectType: AUDIT_SUBJECT_CASE,
        subjectRef: row.id,
        outcome: 'ACCEPTED',
        reason: decisionReason,
        before: { status: row.status },
        after: { status: claimed.row.status },
      });

      return executeCase(claimed.row, approver, decisionReason ?? null);
    },

    async rejectRefund(actor, caseId, decisionReason) {
      const permission = denied(actor, 'refunds:approve');
      if (!permission.allowed) {
        if (actor) {
          await emit({
            action: 'refunds:reject',
            actorId: actor.id,
            actorRole: actor.role,
            subjectType: AUDIT_SUBJECT_CASE,
            subjectRef: caseId,
            outcome: 'DENIED',
            reason: 'Actor lacks refunds:approve',
          });
        }
        return { ok: false, error: permission.error };
      }
      const decider = permission.actor;

      const row = workflow.getRefundCaseById(caseId);
      if (!row) return { ok: false, error: notFoundError('Refund case not found') };
      if (row.status !== 'PENDING_APPROVAL') {
        return { ok: false, error: conflictError(`Refund case is ${row.status}`) };
      }

      const updated = workflow.updateRefundCase(row.id, {
        status: 'REJECTED',
        approvedBy: decider.id,
        approvedAt: now(),
        decisionReason,
        expectedVersion: row.version,
      });
      if (!updated.success) {
        return { ok: false, error: conflictError('Refund case changed while being rejected') };
      }

      await emit({
        action: 'refunds:reject',
        actorId: decider.id,
        actorRole: decider.role,
        subjectType: AUDIT_SUBJECT_CASE,
        subjectRef: row.id,
        outcome: 'ACCEPTED',
        reason: decisionReason,
        before: { status: row.status },
        after: { status: updated.row.status },
      });

      return { ok: true, value: { case: toCaseSummary(updated.row), replayed: false } };
    },
  };

  /**
   * Performs the single money-moving call for a case and records the result.
   *
   * The connector is keyed by the case's idempotency key, so a retry of this step returns
   * the original refund instead of issuing a second one.
   */
  async function executeCase(
    row: RefundCase,
    actor: Actor,
    decisionReason: string | null,
  ): Promise<Result<RequestRefundOutcome>> {
    const execution = payments.executeRefund(row.paymentRef, row.amountMinor, row.idempotencyKey);

    if ('error' in execution) {
      const failed = workflow.updateRefundCase(row.id, {
        status: 'REJECTED',
        decisionReason: execution.error,
        expectedVersion: row.version,
      });

      await emit({
        action: 'refunds:execute',
        actorId: actor.id,
        actorRole: actor.role,
        subjectType: AUDIT_SUBJECT_CASE,
        subjectRef: row.id,
        outcome: 'FAILED',
        reason: execution.error,
        before: { status: row.status },
        after: { status: failed.success ? failed.row.status : row.status },
      });

      return { ok: false, error: preconditionError(execution.error) };
    }

    const executed = workflow.updateRefundCase(row.id, {
      status: 'EXECUTED',
      executionRef: execution.executionRef,
      decisionReason,
      expectedVersion: row.version,
    });
    if (!executed.success) {
      return { ok: false, error: conflictError('Refund case changed while being executed') };
    }

    await emit({
      action: 'refunds:execute',
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: AUDIT_SUBJECT_CASE,
      subjectRef: row.id,
      outcome: 'ACCEPTED',
      reason: decisionReason ?? row.reason,
      before: { status: row.status },
      after: {
        status: executed.row.status,
        executionRef: execution.executionRef,
        refundedMinor: execution.refundedMinor,
      },
    });

    return { ok: true, value: { case: toCaseSummary(executed.row), replayed: false } };
  }
}
