import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * App-owned workflow state and internal-tool audit only.
 *
 * This database is the Dataverse replacement for state the internal-tools app itself
 * owns. It deliberately stores *references* to external records rather than copies of
 * them. Customer identity and KYC provider evidence, payment/ledger state, and
 * feature-flag values/history stay authoritative in the external domain systems behind
 * CustomerConnector, KycProviderConnector, PaymentsConnector and FeatureFlagConnector.
 *
 * Adding a column that mirrors external authoritative state is a design regression, not
 * a convenience. Compose it at read time from the connector instead.
 */

/** App workflow statuses for a KYC review. Provider verification state is NOT this. */
export const KYC_WORKFLOW_STATUS = [
  'OPEN',
  'IN_REVIEW',
  'AWAITING_INFO',
  'APPROVED',
  'REJECTED',
] as const;
export type KycWorkflowStatus = (typeof KYC_WORKFLOW_STATUS)[number];

/** App workflow statuses for a refund request. Payment execution state is NOT this. */
export const REFUND_WORKFLOW_STATUS = [
  'PENDING_APPROVAL',
  'APPROVED',
  'EXECUTED',
  'REJECTED',
] as const;
export type RefundWorkflowStatus = (typeof REFUND_WORKFLOW_STATUS)[number];

/** Whether an audited attempt actually changed anything. Denials must never read as success. */
export const AUDIT_OUTCOME = ['ACCEPTED', 'DENIED', 'FAILED'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOME)[number];

/** Which internal tool emitted the event. New tools (#4-#13) extend this union. */
export const AUDIT_APP = ['kyc', 'refunds', 'flags', 'platform'] as const;
export type AuditApp = (typeof AUDIT_APP)[number];

/**
 * App-owned review metadata for a KYC case.
 *
 * `providerCaseRef` points at the authoritative case in the KYC provider; the customer
 * identity, documents, risk scoring and sanctions/PEP evidence are read through
 * KycProviderConnector and CustomerConnector and are never mirrored here.
 */
export const kycCaseWorkflow = sqliteTable(
  'kyc_case_workflow',
  {
    id: text('id').primaryKey(),
    providerCaseRef: text('provider_case_ref').notNull(),
    customerRef: text('customer_ref').notNull(),
    status: text('status').$type<KycWorkflowStatus>().notNull().default('OPEN'),
    assigneeId: text('assignee_id'),
    openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    decisionReason: text('decision_reason'),
    decidedBy: text('decided_by'),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    /** Optimistic concurrency guard for concurrent reviewers. */
    version: integer('version').notNull().default(1),
  },
  (table) => [
    uniqueIndex('kyc_case_workflow_provider_case_ref_idx').on(table.providerCaseRef),
    index('kyc_case_workflow_status_idx').on(table.status),
    index('kyc_case_workflow_assignee_idx').on(table.assigneeId),
  ],
);

/**
 * App-owned workflow and approval metadata for a refund request.
 *
 * The refund is only *money* once PaymentsConnector executes it. `executionRef` records
 * the identifier the payments system returned; the authoritative refund/payment history
 * stays there. `idempotencyKey` is unique so a replayed submit cannot create a second
 * request, and the payments call is keyed by the same value.
 */
export const refundCaseWorkflow = sqliteTable(
  'refund_case_workflow',
  {
    id: text('id').primaryKey(),
    /** Authoritative transaction in PaymentsConnector this refund is against. */
    paymentRef: text('payment_ref').notNull(),
    customerRef: text('customer_ref').notNull(),
    /** Minor units (pence). Never store money as a float. */
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    reason: text('reason').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').$type<RefundWorkflowStatus>().notNull(),
    requestedBy: text('requested_by').notNull(),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
    approvedBy: text('approved_by'),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    decisionReason: text('decision_reason'),
    /** Identifier returned by PaymentsConnector once execution succeeded. */
    executionRef: text('execution_ref'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    uniqueIndex('refund_case_workflow_idempotency_key_idx').on(table.idempotencyKey),
    index('refund_case_workflow_payment_ref_idx').on(table.paymentRef),
    index('refund_case_workflow_status_idx').on(table.status),
  ],
);

/**
 * Common internal-tool audit event, shared by every app in the portfolio.
 *
 * This records what a human did *in this tool*. It does not replace financial history in
 * PaymentsConnector or authoritative flag-change history in FeatureFlagConnector; those
 * remain the system of record for their own domains.
 */
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    app: text('app').$type<AuditApp>().notNull(),
    actorId: text('actor_id').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectRef: text('subject_ref').notNull(),
    outcome: text('outcome').$type<AuditOutcome>().notNull(),
    reason: text('reason'),
    /** JSON snapshots of the app-owned fields only, for before/after diffing. */
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    /** Correlates an audit row with the request that produced it. */
    requestId: text('request_id'),
  },
  (table) => [
    index('audit_events_subject_idx').on(table.subjectType, table.subjectRef),
    index('audit_events_occurred_at_idx').on(table.occurredAt),
    index('audit_events_app_idx').on(table.app),
  ],
);

export const schema = { kycCaseWorkflow, refundCaseWorkflow, auditEvents };
