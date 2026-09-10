import type { Actor } from '@/lib/auth/session';
import {
  conflictError,
  forbiddenError,
  notFoundError,
  preconditionError,
  type AppError,
} from '@/lib/errors/errors';
import type { CustomerConnector } from '@/lib/integrations/types';
import type { AuditSink, KycCase, WorkflowRepository } from '@/lib/repositories/types';

import { canAccessKyc, canOverrideSanctions, canReviewKyc, KYC_REVIEW_ACTION } from './authorization';
import type {
  KycCaseDetail,
  KycCaseEvidence,
  KycDecision,
  KycQueueFilters,
  KycQueueItem,
  KycReviewProviderConnector,
} from './types';

/**
 * KYC review domain layer.
 *
 * Everything a decision depends on is enforced here, below the Route Handlers: capability
 * checks, document completeness, the sanctions/PEP override, and re-decision. A route or a
 * component can only ask for a decision; it cannot grant one. Denials return a typed error,
 * leave workflow state untouched, and are audited as denials.
 */

export interface KycDeps {
  workflow: WorkflowRepository;
  audit: AuditSink;
  customers: CustomerConnector;
  provider: KycReviewProviderConnector;
  /** Injected so tests and the queue's age column do not depend on wall-clock drift. */
  now?: () => Date;
}

export const KYC_SUBJECT_TYPE = 'kyc_case';

const TERMINAL_STATUSES: readonly KycCase['status'][] = ['APPROVED', 'REJECTED'];

function ageHours(openedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - openedAt.getTime()) / (60 * 60 * 1000)));
}

function toQueueItem(
  row: KycCase,
  evidence: KycCaseEvidence,
  customerName: string,
  country: string,
  now: Date,
): KycQueueItem {
  return {
    id: row.id,
    providerCaseRef: row.providerCaseRef,
    customerRef: row.customerRef,
    customerName,
    country,
    status: row.status,
    riskLevel: evidence.riskLevel,
    hasSanctionsFlag: evidence.hasSanctionsFlag,
    hasPepFlag: evidence.hasPepFlag,
    assigneeId: row.assigneeId,
    openedAt: row.openedAt,
    ageHours: ageHours(row.openedAt, now),
  };
}

function matchesFilters(item: KycQueueItem, filters: KycQueueFilters): boolean {
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = `${item.customerName} ${item.customerRef}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (filters.status && item.status !== filters.status) return false;
  if (filters.risk && item.riskLevel !== filters.risk) return false;
  if (filters.country && item.country !== filters.country) return false;
  if (filters.assignee) {
    const assignee = filters.assignee === 'unassigned' ? null : filters.assignee;
    if (item.assigneeId !== assignee) return false;
  }
  return true;
}

/** Cases the actor may see, filtered server-side and ordered oldest-first. */
export function listQueue(
  deps: KycDeps,
  actor: Actor,
  filters: KycQueueFilters = {},
): KycQueueItem[] | AppError {
  if (!canAccessKyc(actor.role)) {
    return forbiddenError('Access to KYC is not permitted for this role');
  }

  const now = deps.now?.() ?? new Date();

  return deps.workflow
    .listKycCases()
    .flatMap((row) => {
      const evidence = deps.provider.getCaseEvidence(row.providerCaseRef);
      const customer = deps.customers.getCustomer(row.customerRef);
      if (!evidence || !customer) return [];
      return [toQueueItem(row, evidence, customer.displayName, customer.region, now)];
    })
    .filter((item) => matchesFilters(item, filters))
    .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
}

/** One case: app-owned workflow state, authoritative evidence, and its audit timeline. */
export function getCaseDetail(
  deps: KycDeps,
  actor: Actor,
  caseId: string,
): KycCaseDetail | AppError {
  if (!canAccessKyc(actor.role)) {
    return forbiddenError('Access to KYC is not permitted for this role');
  }

  const row = deps.workflow.getKycCaseById(caseId);
  if (!row) return notFoundError('KYC case not found');

  const evidence = deps.provider.getCaseEvidence(row.providerCaseRef);
  const customer = deps.customers.getCustomer(row.customerRef);
  if (!evidence || !customer) return notFoundError('KYC case evidence not found');

  const now = deps.now?.() ?? new Date();

  return {
    workflow: row,
    evidence,
    customer,
    queueItem: toQueueItem(row, evidence, customer.displayName, customer.region, now),
    audit: deps.audit.listForSubject(KYC_SUBJECT_TYPE, row.id),
  };
}

/** Required documents the provider has not received, blocking approval. */
export function outstandingDocuments(evidence: KycCaseEvidence): string[] {
  return evidence.documents
    .filter((doc) => doc.required && doc.status !== 'received')
    .map((doc) => doc.kind);
}

export function requiresSanctionsOverride(evidence: KycCaseEvidence): boolean {
  return evidence.hasSanctionsFlag || evidence.hasPepFlag;
}

export interface DecisionInput {
  caseId: string;
  decision: KycDecision;
  reason: string;
  /** Version the reviewer's page was rendered from; guards concurrent decisions. */
  expectedVersion: number;
}

function snapshot(row: KycCase) {
  return {
    status: row.status,
    assigneeId: row.assigneeId,
    decisionReason: row.decisionReason,
    decidedBy: row.decidedBy,
    version: row.version,
  };
}

/**
 * Applies a reviewer decision, or refuses it with a typed error.
 *
 * Every refusal path returns before any repository write and records a `DENIED` audit event,
 * so a denied attempt can never be mistaken for a decision.
 */
export async function decideCase(
  deps: KycDeps,
  actor: Actor,
  input: DecisionInput,
): Promise<KycCase | AppError> {
  const deny = async (error: AppError, row: KycCase | null): Promise<AppError> => {
    await deps.audit.emit({
      app: 'kyc',
      action: KYC_REVIEW_ACTION,
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: KYC_SUBJECT_TYPE,
      subjectRef: input.caseId,
      outcome: 'DENIED',
      reason: error.message,
      before: row ? snapshot(row) : undefined,
    });
    return error;
  };

  if (!canAccessKyc(actor.role)) {
    return deny(forbiddenError('Access to KYC is not permitted for this role'), null);
  }
  if (!canReviewKyc(actor.role)) {
    return deny(forbiddenError('Deciding a KYC case is not permitted for this role'), null);
  }

  const row = deps.workflow.getKycCaseById(input.caseId);
  if (!row) return notFoundError('KYC case not found');

  const evidence = deps.provider.getCaseEvidence(row.providerCaseRef);
  if (!evidence) return notFoundError('KYC case evidence not found');

  if (TERMINAL_STATUSES.includes(row.status)) {
    return deny(conflictError(`Case is already ${row.status.toLowerCase()}`), row);
  }

  if (input.decision === 'APPROVE') {
    const outstanding = outstandingDocuments(evidence);
    if (outstanding.length > 0) {
      return deny(
        preconditionError(`Approval blocked: required documents outstanding (${outstanding.join(', ')})`),
        row,
      );
    }
    if (requiresSanctionsOverride(evidence) && !canOverrideSanctions(actor.role)) {
      return deny(
        forbiddenError('Approving a sanctions or PEP hit requires a Manager / Admin override'),
        row,
      );
    }
  }

  const status: KycCase['status'] = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const result = deps.workflow.updateKycCase(row.id, {
    status,
    decisionReason: input.reason,
    decidedBy: actor.id,
    expectedVersion: input.expectedVersion,
  });

  if (!result.success) {
    if (result.error.kind === 'NOT_FOUND') return notFoundError('KYC case not found');
    return deny(
      conflictError('This case changed while you were reviewing it. Reload and try again.'),
      row,
    );
  }

  await deps.audit.emit({
    app: 'kyc',
    action: KYC_REVIEW_ACTION,
    actorId: actor.id,
    actorRole: actor.role,
    subjectType: KYC_SUBJECT_TYPE,
    subjectRef: row.id,
    outcome: 'ACCEPTED',
    reason: input.reason,
    before: snapshot(row),
    after: snapshot(result.row),
  });

  return result.row;
}
