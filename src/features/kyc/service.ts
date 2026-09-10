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

import {
  canAccessKyc,
  canAssignKyc,
  canOverrideSanctions,
  canReviewKyc,
  escalationTargetAssigneeId,
  KYC_ASSIGN_ACTION,
  KYC_ESCALATE_ACTION,
  KYC_REQUEST_INFO_ACTION,
  KYC_REVIEW_ACTION,
} from './authorization';
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

function matchesFilters(item: KycQueueItem, filters: KycQueueFilters, actorId: string): boolean {
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = `${item.customerName} ${item.customerRef}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (filters.status && item.status !== filters.status) return false;
  if (filters.risk && item.riskLevel !== filters.risk) return false;
  if (filters.country && item.country !== filters.country) return false;
  if (filters.assignee) {
    const assignee =
      filters.assignee === 'unassigned' ? null
      : filters.assignee === 'me' ? actorId
      : filters.assignee;
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
    .filter((item) => matchesFilters(item, filters, actor.id))
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
 * Every refusal path returns before any repository write and records a `DENIED` audit event,
 * so a denied attempt can never be mistaken for an accepted mutation.
 */
async function deny(
  deps: KycDeps,
  actor: Actor,
  action: string,
  caseId: string,
  error: AppError,
  row: KycCase | null,
): Promise<AppError> {
  await deps.audit.emit({
    app: 'kyc',
    action,
    actorId: actor.id,
    actorRole: actor.role,
    subjectType: KYC_SUBJECT_TYPE,
    subjectRef: caseId,
    outcome: 'DENIED',
    reason: error.message,
    before: row ? snapshot(row) : undefined,
  });
  return error;
}

export interface ClaimInput {
  caseId: string;
  /** Version the reviewer's page was rendered from; guards concurrent claims. */
  expectedVersion: number;
}

/**
 * Claims a case for the actor: `assigneeId` becomes the actor and an `OPEN` case moves to
 * `IN_REVIEW`. Only the assignee may decide or escalate a case, so claiming is how a
 * reviewer takes ownership of it.
 *
 * An unassigned case is claimable by anyone with `kyc:assign`. A case already held by
 * someone else can only be pulled by a role with the sanctions-override capability
 * (Manager / Admin), which is the same tier escalations land on. Claiming a case you
 * already hold is a no-op, so a retried request returns the same state.
 */
export async function claimCase(
  deps: KycDeps,
  actor: Actor,
  input: ClaimInput,
): Promise<KycCase | AppError> {
  const denyClaim = (error: AppError, row: KycCase | null) =>
    deny(deps, actor, KYC_ASSIGN_ACTION, input.caseId, error, row);

  if (!canAccessKyc(actor.role)) {
    return denyClaim(forbiddenError('Access to KYC is not permitted for this role'), null);
  }
  if (!canAssignKyc(actor.role)) {
    return denyClaim(forbiddenError('Claiming a KYC case is not permitted for this role'), null);
  }

  const row = deps.workflow.getKycCaseById(input.caseId);
  if (!row) return notFoundError('KYC case not found');

  if (TERMINAL_STATUSES.includes(row.status)) {
    return denyClaim(conflictError(`Case is already ${row.status.toLowerCase()}`), row);
  }

  if (row.assigneeId === actor.id) {
    // Already held by this actor. Still moves an anomalous OPEN-but-assigned row into review.
    if (row.status === 'IN_REVIEW') return row;
  } else if (row.assigneeId !== null && !canOverrideSanctions(actor.role)) {
    return denyClaim(
      conflictError('Case is already assigned to another reviewer'),
      row,
    );
  }

  const result = deps.workflow.updateKycCase(row.id, {
    status: 'IN_REVIEW',
    assigneeId: actor.id,
    expectedVersion: input.expectedVersion,
  });

  if (!result.success) {
    if (result.error.kind === 'NOT_FOUND') return notFoundError('KYC case not found');
    return denyClaim(
      conflictError('This case changed while you were reviewing it. Reload and try again.'),
      row,
    );
  }

  await deps.audit.emit({
    app: 'kyc',
    action: KYC_ASSIGN_ACTION,
    actorId: actor.id,
    actorRole: actor.role,
    subjectType: KYC_SUBJECT_TYPE,
    subjectRef: row.id,
    outcome: 'ACCEPTED',
    reason: row.assigneeId === actor.id ? 'Claimed case' : `Claimed case from ${row.assigneeId ?? 'unassigned'}`,
    before: snapshot(row),
    after: snapshot(result.row),
  });

  return result.row;
}

export interface EscalateInput {
  caseId: string;
  /** Why the case is being handed up; recorded in the case audit timeline. */
  reason: string;
  expectedVersion: number;
}

/**
 * Escalates a case to the Manager / Admin tier by reassigning it.
 *
 * Only the reviewer who holds the case can escalate it, and only while it is undecided.
 * After escalation the assignee is the manager tier, so a manager sees the case as assigned
 * to them and the original reviewer no longer holds it — and therefore can no longer decide
 * it. Manager / Admin is the top tier and has no escalation target.
 */
export async function escalateCase(
  deps: KycDeps,
  actor: Actor,
  input: EscalateInput,
): Promise<KycCase | AppError> {
  const denyEscalation = (error: AppError, row: KycCase | null) =>
    deny(deps, actor, KYC_ESCALATE_ACTION, input.caseId, error, row);

  if (!canAccessKyc(actor.role)) {
    return denyEscalation(forbiddenError('Access to KYC is not permitted for this role'), null);
  }
  if (!canAssignKyc(actor.role)) {
    return denyEscalation(forbiddenError('Escalating a KYC case is not permitted for this role'), null);
  }

  const row = deps.workflow.getKycCaseById(input.caseId);
  if (!row) return notFoundError('KYC case not found');

  if (TERMINAL_STATUSES.includes(row.status)) {
    return denyEscalation(conflictError(`Case is already ${row.status.toLowerCase()}`), row);
  }

  if (row.assigneeId !== actor.id) {
    return denyEscalation(
      forbiddenError('Only the reviewer who holds this case can escalate it'),
      row,
    );
  }

  const target = escalationTargetAssigneeId(actor.role);
  if (!target) {
    return denyEscalation(
      conflictError('This case is already at the Manager / Admin review tier'),
      row,
    );
  }

  const result = deps.workflow.updateKycCase(row.id, {
    assigneeId: target,
    expectedVersion: input.expectedVersion,
  });

  if (!result.success) {
    if (result.error.kind === 'NOT_FOUND') return notFoundError('KYC case not found');
    return denyEscalation(
      conflictError('This case changed while you were reviewing it. Reload and try again.'),
      row,
    );
  }

  await deps.audit.emit({
    app: 'kyc',
    action: KYC_ESCALATE_ACTION,
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

export interface RequestInfoInput {
  caseId: string;
  /** What the customer is being asked for; recorded in the case audit timeline. */
  reason: string;
  expectedVersion: number;
}

/**
 * Moves a case to `AWAITING_INFO` while the customer is asked for more evidence — a missing
 * proof of address, a fresher document, a source-of-funds explanation.
 *
 * Unlike deciding or escalating, requesting information does not require holding the case:
 * a manager can ask for more evidence on an analyst's case without taking it over. An
 * unassigned case becomes the requester's, because someone has to own the pending request.
 * The request text lives in the audit detail; the case keeps no mirrored copy of it.
 */
export async function requestMoreInfo(
  deps: KycDeps,
  actor: Actor,
  input: RequestInfoInput,
): Promise<KycCase | AppError> {
  const denyRequest = (error: AppError, row: KycCase | null) =>
    deny(deps, actor, KYC_REQUEST_INFO_ACTION, input.caseId, error, row);

  if (!canAccessKyc(actor.role)) {
    return denyRequest(forbiddenError('Access to KYC is not permitted for this role'), null);
  }
  if (!canAssignKyc(actor.role)) {
    return denyRequest(
      forbiddenError('Requesting information on a KYC case is not permitted for this role'),
      null,
    );
  }

  const row = deps.workflow.getKycCaseById(input.caseId);
  if (!row) return notFoundError('KYC case not found');

  if (TERMINAL_STATUSES.includes(row.status)) {
    return denyRequest(conflictError(`Case is already ${row.status.toLowerCase()}`), row);
  }

  const result = deps.workflow.updateKycCase(row.id, {
    status: 'AWAITING_INFO',
    assigneeId: row.assigneeId ?? actor.id,
    expectedVersion: input.expectedVersion,
  });

  if (!result.success) {
    if (result.error.kind === 'NOT_FOUND') return notFoundError('KYC case not found');
    return denyRequest(
      conflictError('This case changed while you were reviewing it. Reload and try again.'),
      row,
    );
  }

  await deps.audit.emit({
    app: 'kyc',
    action: KYC_REQUEST_INFO_ACTION,
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

/**
 * Applies a reviewer decision, or refuses it with a typed error.
 *
 * A decision requires the actor to hold the case: claim it first, or have it escalated to
 * your tier.
 */
export async function decideCase(
  deps: KycDeps,
  actor: Actor,
  input: DecisionInput,
): Promise<KycCase | AppError> {
  const denyDecision = (error: AppError, row: KycCase | null) =>
    deny(deps, actor, KYC_REVIEW_ACTION, input.caseId, error, row);

  if (!canAccessKyc(actor.role)) {
    return denyDecision(forbiddenError('Access to KYC is not permitted for this role'), null);
  }
  if (!canReviewKyc(actor.role)) {
    return denyDecision(forbiddenError('Deciding a KYC case is not permitted for this role'), null);
  }

  const row = deps.workflow.getKycCaseById(input.caseId);
  if (!row) return notFoundError('KYC case not found');

  const evidence = deps.provider.getCaseEvidence(row.providerCaseRef);
  if (!evidence) return notFoundError('KYC case evidence not found');

  if (TERMINAL_STATUSES.includes(row.status)) {
    return denyDecision(conflictError(`Case is already ${row.status.toLowerCase()}`), row);
  }

  if (row.assigneeId !== actor.id) {
    return denyDecision(
      forbiddenError('You must hold this case to decide it. Claim it first.'),
      row,
    );
  }

  if (input.decision === 'APPROVE') {
    const outstanding = outstandingDocuments(evidence);
    if (outstanding.length > 0) {
      return denyDecision(
        preconditionError(`Approval blocked: required documents outstanding (${outstanding.join(', ')})`),
        row,
      );
    }
    if (requiresSanctionsOverride(evidence) && !canOverrideSanctions(actor.role)) {
      return denyDecision(
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
    return denyDecision(
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
