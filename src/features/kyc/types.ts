import type {
  Customer,
  KycEvidence,
  KycProviderConnector,
  KycRiskLevel,
} from '@/lib/integrations/types';
import type { AuditEventRow, KycCase } from '@/lib/repositories/types';

/**
 * KYC review types.
 *
 * `KycReviewProviderConnector` extends the frozen `KycProviderConnector` rather than changing
 * it: a reviewer needs the referral reason and the document/check breakdown that the frozen
 * `KycEvidence` shape does not carry. The extension lives here so the feature branch keeps
 * compiling against the shared contract; folding it into
 * `src/lib/integrations/types.ts` is a shared change for a separate PR.
 */

export type KycDocumentStatus = 'received' | 'missing' | 'expired';

export interface KycDocument {
  kind: string;
  status: KycDocumentStatus;
  /** A required document that is not `received` blocks approval. */
  required: boolean;
  receivedAt: Date | null;
}

export type KycCheckOutcome = 'pass' | 'fail' | 'review';

export interface KycProviderCheck {
  name: string;
  outcome: KycCheckOutcome;
  detail: string;
  completedAt: Date | null;
}

/** Provider evidence plus the reviewer-facing context the queue refers cases with. */
export interface KycCaseEvidence extends KycEvidence {
  /** Why the provider referred this case for human review. */
  referralReason: string;
  documents: KycDocument[];
  checks: KycProviderCheck[];
}

export interface KycReviewProviderConnector extends KycProviderConnector {
  getCaseEvidence(providerCaseRef: string): KycCaseEvidence | null;
  listCaseEvidence(): KycCaseEvidence[];
}

/** A queue row: app-owned workflow state composed with authoritative provider evidence. */
export interface KycQueueItem {
  id: string;
  providerCaseRef: string;
  customerRef: string;
  customerName: string;
  country: string;
  status: KycCase['status'];
  riskLevel: KycRiskLevel;
  hasSanctionsFlag: boolean;
  hasPepFlag: boolean;
  assigneeId: string | null;
  openedAt: Date;
  /** Whole hours since the case was opened, derived at read time. */
  ageHours: number;
}

export interface KycCaseDetail {
  workflow: KycCase;
  evidence: KycCaseEvidence;
  customer: Customer;
  queueItem: KycQueueItem;
  audit: AuditEventRow[];
}

export interface KycQueueFilters {
  /** Free-text match against customer name and customer reference. */
  search?: string;
  status?: KycCase['status'];
  risk?: KycRiskLevel;
  country?: string;
  assignee?: string;
}

export type KycDecision = 'APPROVE' | 'REJECT';
