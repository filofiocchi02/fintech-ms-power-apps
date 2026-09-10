import { closeDb, createDb, resolveDbPath, type AppDatabase } from './client';
import { runMigrations } from './migrate';
import { kycCaseWorkflow, type KycWorkflowStatus } from './schema';

/**
 * Deterministic, idempotent demo seed for app-owned workflow state.
 *
 * Rules this file must keep obeying:
 *  - Deterministic: fixed ids and fixed timestamps. No Date.now(), no Math.random(), no
 *    randomUUID(). Two runs on two machines produce byte-identical rows.
 *  - Idempotent: re-running never duplicates or clobbers reviewer work. Inserts ignore
 *    conflicts on the natural key rather than upserting over a real decision.
 *  - App-owned only: rows here reference external records by id. Customer PII, provider
 *    evidence, payment state and flag values come from the connectors at read time.
 *  - No fabricated audit. audit_events stays empty until a human actually does something in
 *    the tool; a seeded "approval" would make the audit trail lie.
 */

/**
 * Fixed clock so seeded case ages are stable across machines and runs. The epoch stays a
 * fixed recent date so seeded ages read in hours/days rather than months; when it goes
 * stale, bump it rather than reaching for Date.now() — determinism is the rule.
 */
const SEED_EPOCH = Date.parse('2026-09-04T09:00:00.000Z');
const hours = (n: number) => n * 60 * 60 * 1000;

type SeedKycCase = {
  id: string;
  providerCaseRef: string;
  customerRef: string;
  status: KycWorkflowStatus;
  assigneeId: string | null;
  openedOffsetHours: number;
};

/**
 * Cases the review queue starts with. `providerCaseRef` / `customerRef` must match the
 * fixtures behind KycProviderConnector and CustomerConnector, otherwise the detail view has
 * app-owned metadata with nothing authoritative to join to.
 *
 * The spread is intentional: unassigned and assigned, fresh and aged, so the queue's
 * status/assignee/age columns and filters have something real to show. Assignee ids are
 * real demo user ids (`src/lib/auth/users.ts`), so Casey sees a case she already holds and
 * Morgan sees one escalated onto the Manager / Admin tier.
 */
export const SEED_KYC_CASES: readonly SeedKycCase[] = [
  {
    id: 'kycwf_0001',
    providerCaseRef: 'kyc_case_5001',
    customerRef: 'cus_1001',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 0,
  },
  {
    id: 'kycwf_0002',
    providerCaseRef: 'kyc_case_5002',
    customerRef: 'cus_1002',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 5,
  },
  {
    id: 'kycwf_0003',
    providerCaseRef: 'kyc_case_5003',
    customerRef: 'cus_1003',
    status: 'IN_REVIEW',
    assigneeId: 'user_casey',
    openedOffsetHours: 26,
  },
  {
    id: 'kycwf_0004',
    providerCaseRef: 'kyc_case_5004',
    customerRef: 'cus_1004',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 52,
  },
  {
    id: 'kycwf_0005',
    providerCaseRef: 'kyc_case_5005',
    customerRef: 'cus_1005',
    status: 'IN_REVIEW',
    assigneeId: 'user_morgan',
    openedOffsetHours: 73,
  },
  {
    id: 'kycwf_0006',
    providerCaseRef: 'kyc_case_5006',
    customerRef: 'cus_1006',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 121,
  },
  {
    id: 'kycwf_0007',
    providerCaseRef: 'kyc_case_5007',
    customerRef: 'cus_1007',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 3,
  },
  {
    id: 'kycwf_0008',
    providerCaseRef: 'kyc_case_5008',
    customerRef: 'cus_1008',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 12,
  },
  {
    id: 'kycwf_0009',
    providerCaseRef: 'kyc_case_5009',
    customerRef: 'cus_1011',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 30,
  },
  {
    id: 'kycwf_0010',
    providerCaseRef: 'kyc_case_5010',
    customerRef: 'cus_1010',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 60,
  },
  {
    id: 'kycwf_0011',
    providerCaseRef: 'kyc_case_5011',
    customerRef: 'cus_1009',
    status: 'OPEN',
    assigneeId: null,
    openedOffsetHours: 96,
  },
];

export function seedDatabase(db: AppDatabase): void {
  for (const seedCase of SEED_KYC_CASES) {
    const openedAt = new Date(SEED_EPOCH + hours(seedCase.openedOffsetHours));

    db.insert(kycCaseWorkflow)
      .values({
        id: seedCase.id,
        providerCaseRef: seedCase.providerCaseRef,
        customerRef: seedCase.customerRef,
        status: seedCase.status,
        assigneeId: seedCase.assigneeId,
        openedAt,
        updatedAt: openedAt,
        version: 1,
      })
      // Do nothing rather than upsert: an existing row may hold a real reviewer decision.
      .onConflictDoNothing({ target: kycCaseWorkflow.providerCaseRef })
      .run();
  }
}

const isDirectRun = process.argv[1]?.includes('seed');

if (isDirectRun) {
  const target = resolveDbPath();
  runMigrations(target);

  const db = createDb(target);
  try {
    seedDatabase(db);
  } finally {
    // Also checkpoints the WAL, so the demo database is a single tidy file afterwards.
    closeDb(db);
  }

  console.log(`Seeded ${SEED_KYC_CASES.length} KYC workflow rows into ${target}`);
}
