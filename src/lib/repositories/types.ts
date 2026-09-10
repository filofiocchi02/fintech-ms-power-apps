import type { AppAction } from '@/lib/auth/roles';
import type {
  auditEvents,
  AuditApp,
  kycCaseWorkflow,
  refundCaseWorkflow,
} from '@/db/schema';

/**
 * Repository contracts for app-owned workflow state and internal-tool audit.
 *
 * The SQLite implementations in ./sqlite/ are the prototype backing; production swaps them for
 * PostgreSQL / Azure SQL and the company's durable audit platform. Callers above this layer
 * (pages, Route Handlers, connectors) depend only on these interfaces.
 *
 * These contracts are frozen once the foundation PR merges. Changing them forces every
 * downstream feature branch to rebase.
 */

export type KycCase = typeof kycCaseWorkflow.$inferSelect;
export type RefundCase = typeof refundCaseWorkflow.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;

export type NewKycCase = Omit<KycCase, 'version'>;
export type NewRefundCase = Omit<RefundCase, 'version'>;

export interface KycCaseUpdate {
  status?: KycCase['status'];
  assigneeId?: string | null;
  decisionReason?: string | null;
  decidedBy?: string | null;
  /** Optimistic concurrency version from the read that produced this update. */
  expectedVersion: number;
}

export interface RefundCaseUpdate {
  status?: RefundCase['status'];
  approvedBy?: string | null;
  approvedAt?: Date | null;
  decisionReason?: string | null;
  executionRef?: string | null;
  expectedVersion: number;
}

export interface OptimisticConcurrencyError {
  kind: 'OPTIMISTIC_CONCURRENCY';
  expected: number;
  actual: number | null;
}

export type WorkflowUpdateResult<T> =
  | { success: true; row: T }
  | { success: false; error: OptimisticConcurrencyError | { kind: 'NOT_FOUND' } };

export interface WorkflowRepository {
  // KYC workflow state.
  createKycCase(row: NewKycCase): KycCase;
  getKycCaseById(id: string): KycCase | null;
  getKycCaseByProviderRef(providerCaseRef: string): KycCase | null;
  listKycCases(): KycCase[];
  updateKycCase(id: string, update: KycCaseUpdate): WorkflowUpdateResult<KycCase>;

  // Refund workflow/approval state.
  createRefundCase(row: NewRefundCase): RefundCase;
  getRefundCaseById(id: string): RefundCase | null;
  getRefundCaseByIdempotencyKey(idempotencyKey: string): RefundCase | null;
  listRefundCases(): RefundCase[];
  updateRefundCase(id: string, update: RefundCaseUpdate): WorkflowUpdateResult<RefundCase>;
}

export interface AuditEventInput {
  app: AuditApp;
  action: AppAction | string;
  actorId: string;
  actorRole: string;
  subjectType: string;
  subjectRef: string;
  outcome: 'ACCEPTED' | 'DENIED' | 'FAILED';
  reason?: string;
  /** App-owned snapshot only. No PII, no connector payloads. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId?: string;
}

export interface AuditSink {
  emit(event: AuditEventInput): Promise<AuditEventRow> | AuditEventRow;
  listForSubject(subjectType: string, subjectRef: string): AuditEventRow[];
}
