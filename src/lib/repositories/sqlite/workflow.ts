import { and, eq } from 'drizzle-orm';

import type { AppDatabase } from '@/db/client';
import { kycCaseWorkflow, refundCaseWorkflow } from '@/db/schema';

import type {
  KycCase,
  KycCaseUpdate,
  NewKycCase,
  NewRefundCase,
  OptimisticConcurrencyError,
  RefundCase,
  RefundCaseUpdate,
  WorkflowRepository,
  WorkflowUpdateResult,
} from '../types';

export function createWorkflowRepository(db: AppDatabase): WorkflowRepository {
  return {
    createKycCase(row: NewKycCase): KycCase {
      db.insert(kycCaseWorkflow)
        .values({ ...row, version: 1 })
        .run();
      const created = db
        .select()
        .from(kycCaseWorkflow)
        .where(eq(kycCaseWorkflow.providerCaseRef, row.providerCaseRef))
        .get();
      if (!created) {
        throw new Error(`KYC case with providerCaseRef ${row.providerCaseRef} was not created`);
      }
      return created;
    },

    getKycCaseById(id: string): KycCase | null {
      return db.select().from(kycCaseWorkflow).where(eq(kycCaseWorkflow.id, id)).get() ?? null;
    },

    getKycCaseByProviderRef(providerCaseRef: string): KycCase | null {
      return (
        db
          .select()
          .from(kycCaseWorkflow)
          .where(eq(kycCaseWorkflow.providerCaseRef, providerCaseRef))
          .get() ?? null
      );
    },

    listKycCases(): KycCase[] {
      return db.select().from(kycCaseWorkflow).all();
    },

    updateKycCase(id: string, update: KycCaseUpdate): WorkflowUpdateResult<KycCase> {
      const existing = this.getKycCaseById(id);
      if (!existing) {
        return { success: false, error: { kind: 'NOT_FOUND' } };
      }

      const decidedAt =
        update.status && ['APPROVED', 'REJECTED'].includes(update.status)
          ? new Date()
          : existing.decidedAt;

      const updateResult = db
        .update(kycCaseWorkflow)
        .set({
          status: update.status,
          assigneeId: update.assigneeId,
          decisionReason: update.decisionReason,
          decidedBy: update.decidedBy,
          decidedAt,
          updatedAt: new Date(),
          version: update.expectedVersion + 1,
        })
        .where(
          and(
            eq(kycCaseWorkflow.id, id),
            eq(kycCaseWorkflow.version, update.expectedVersion),
          ),
        )
        .run();

      if (updateResult.changes === 0) {
        const row = this.getKycCaseById(id);
        return {
          success: false,
          error: optimisticConcurrency(update.expectedVersion, row?.version ?? null),
        };
      }

      const row = this.getKycCaseById(id);
      if (!row) return { success: false, error: { kind: 'NOT_FOUND' } };
      return { success: true, row };
    },

    createRefundCase(row: NewRefundCase): RefundCase {
      db.insert(refundCaseWorkflow).values({ ...row, version: 1 }).run();
      const created = db
        .select()
        .from(refundCaseWorkflow)
        .where(eq(refundCaseWorkflow.idempotencyKey, row.idempotencyKey))
        .get();
      if (!created) {
        throw new Error(`Refund case with idempotencyKey ${row.idempotencyKey} was not created`);
      }
      return created;
    },

    getRefundCaseById(id: string): RefundCase | null {
      return (
        db.select().from(refundCaseWorkflow).where(eq(refundCaseWorkflow.id, id)).get() ?? null
      );
    },

    getRefundCaseByIdempotencyKey(idempotencyKey: string): RefundCase | null {
      return (
        db
          .select()
          .from(refundCaseWorkflow)
          .where(eq(refundCaseWorkflow.idempotencyKey, idempotencyKey))
          .get() ?? null
      );
    },

    listRefundCases(): RefundCase[] {
      return db.select().from(refundCaseWorkflow).all();
    },

    updateRefundCase(id: string, update: RefundCaseUpdate): WorkflowUpdateResult<RefundCase> {
      const existing = this.getRefundCaseById(id);
      if (!existing) {
        return { success: false, error: { kind: 'NOT_FOUND' } };
      }

      const approvedAt =
        update.approvedAt !== undefined
          ? update.approvedAt
          : update.approvedBy === null
            ? null
            : update.approvedBy
              ? new Date()
              : existing.approvedAt;

      const updateResult = db
        .update(refundCaseWorkflow)
        .set({
          status: update.status,
          approvedBy: update.approvedBy,
          approvedAt,
          decisionReason: update.decisionReason,
          executionRef: update.executionRef,
          updatedAt: new Date(),
          version: update.expectedVersion + 1,
        })
        .where(
          and(
            eq(refundCaseWorkflow.id, id),
            eq(refundCaseWorkflow.version, update.expectedVersion),
          ),
        )
        .run();

      if (updateResult.changes === 0) {
        const row = this.getRefundCaseById(id);
        return {
          success: false,
          error: optimisticConcurrency(update.expectedVersion, row?.version ?? null),
        };
      }

      const row = this.getRefundCaseById(id);
      if (!row) return { success: false, error: { kind: 'NOT_FOUND' } };
      return { success: true, row };
    },
  };
}

function optimisticConcurrency(
  expected: number,
  actual: number | null,
): OptimisticConcurrencyError {
  return { kind: 'OPTIMISTIC_CONCURRENCY', expected, actual };
}
