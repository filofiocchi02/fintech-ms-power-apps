/**
 * Server-only connector interfaces.
 *
 * Customer identity, KYC evidence, payment/ledger state and feature-flag history are
 * authoritative in external domain systems. The internal tool reads and mutates them through
 * these contracts, and stores only references to them in its own SQLite database.
 *
 * All implementations live in ./mock/ and import 'server-only' so they cannot be bundled to the
 * client. A real production deployment swaps the mock modules for vendor/PSP/Entra-backed
 * connectors without changing routes or components.
 */

/** Minimal customer identity. PII is kept behind the connector, not copied into SQLite. */
export interface Customer {
  ref: string;
  displayName: string;
  emailDomain: string;
  region: string;
  accountStatus: 'active' | 'suspended' | 'closed';
}

export interface CustomerConnector {
  getCustomer(ref: string): Customer | null;
  listCustomers(): Customer[];
}

export type KycEvidenceStatus = 'pending' | 'verified' | 'rejected';
export type KycRiskLevel = 'low' | 'medium' | 'high';

export interface KycEvidence {
  providerCaseRef: string;
  customerRef: string;
  status: KycEvidenceStatus;
  riskLevel: KycRiskLevel;
  hasSanctionsFlag: boolean;
  hasPepFlag: boolean;
  submittedAt: Date;
  reviewedAt: Date | null;
}

export interface KycProviderConnector {
  getCase(providerCaseRef: string): KycEvidence | null;
  listOpenCases(): KycEvidence[];
}

/** Refund/transaction state from the payments/ledger system. */
export interface PaymentTransaction {
  paymentRef: string;
  customerRef: string;
  amountMinor: number;
  currency: string;
  capturedAt: Date;
  refundableMinor: number;
  status: 'captured' | 'refunded' | 'disputed';
}

export interface RefundResult {
  executionRef: string;
  refundedMinor: number;
  currency: string;
}

export interface PaymentsConnector {
  getTransaction(paymentRef: string): PaymentTransaction | null;
  listRefundableTransactions(): PaymentTransaction[];
  /**
   * Executes the refund in the ledger. `idempotencyKey` prevents double execution on replay.
   * Returns the result or a business-rule error if the refund is invalid.
   */
  executeRefund(
    paymentRef: string,
    amountMinor: number,
    idempotencyKey: string,
  ): RefundResult | { error: string };
}

/** Flag environment. The internal tool writes through the connector; history stays there. */
export type FlagEnvironment = 'dev' | 'staging' | 'production';

export interface FeatureFlag {
  key: string;
  environment: FlagEnvironment;
  enabled: boolean;
  description: string;
  lastModifiedAt: Date;
  lastModifiedBy: string;
}

export interface FeatureFlagHistoryEntry {
  key: string;
  environment: FlagEnvironment;
  actorId: string;
  enabled: boolean;
  reason: string;
  changedAt: Date;
}

export interface FeatureFlagConnector {
  getFlag(key: string, environment: FlagEnvironment): FeatureFlag | null;
  listFlags(environment: FlagEnvironment): FeatureFlag[];
  setFlag(
    key: string,
    environment: FlagEnvironment,
    enabled: boolean,
    actorId: string,
    reason: string,
  ): FeatureFlag | { error: string };
  getHistory(key: string, environment: FlagEnvironment): FeatureFlagHistoryEntry[];
}
