import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditEvents, kycCaseWorkflow, refundCaseWorkflow } from '@/db/schema';
import { SEED_KYC_CASES, seedDatabase } from '@/db/seed';
import { createTestDb } from './helpers/db';

/**
 * Bootstrap-level checks on the persistence foundation the three feature sessions build on.
 * Feature behaviour lives in src/tests/{kyc,refunds,flags}.test.ts.
 */
describe('database foundation', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('migrates to an empty database with no fabricated audit history', () => {
    expect(ctx.db.select().from(kycCaseWorkflow).all()).toHaveLength(0);
    expect(ctx.db.select().from(refundCaseWorkflow).all()).toHaveLength(0);
    expect(ctx.db.select().from(auditEvents).all()).toHaveLength(0);
  });

  it('seeds the expected KYC workflow rows', () => {
    seedDatabase(ctx.db);

    const rows = ctx.db.select().from(kycCaseWorkflow).all();
    expect(rows).toHaveLength(SEED_KYC_CASES.length);
    expect(ctx.db.select().from(auditEvents).all()).toHaveLength(0);
  });

  it('is idempotent: re-seeding does not duplicate rows or overwrite a decision', () => {
    seedDatabase(ctx.db);

    const target = SEED_KYC_CASES[0];
    ctx.db
      .update(kycCaseWorkflow)
      .set({ status: 'APPROVED', decidedBy: 'user_compliance_1', version: 2 })
      .run();

    seedDatabase(ctx.db);

    const rows = ctx.db.select().from(kycCaseWorkflow).all();
    expect(rows).toHaveLength(SEED_KYC_CASES.length);

    const reviewed = rows.find((row) => row.providerCaseRef === target.providerCaseRef);
    expect(reviewed?.status).toBe('APPROVED');
    expect(reviewed?.decidedBy).toBe('user_compliance_1');
  });

  it('is deterministic: seeded timestamps do not drift between runs', () => {
    seedDatabase(ctx.db);
    const first = ctx.db.select().from(kycCaseWorkflow).all();

    const other = createTestDb();
    try {
      seedDatabase(other.db);
      const second = other.db.select().from(kycCaseWorkflow).all();

      expect(second.map((r) => [r.id, r.openedAt?.getTime()])).toStrictEqual(
        first.map((r) => [r.id, r.openedAt?.getTime()]),
      );
    } finally {
      other.cleanup();
    }
  });

  it('closes the SQLite connection on cleanup instead of leaking a handle per test', () => {
    const scratch = createTestDb();
    expect(scratch.db.$client.open).toBe(true);

    scratch.cleanup();

    // Without this, a suite of N isolated databases holds N descriptors until process exit.
    expect(scratch.db.$client.open).toBe(false);
  });

  it('rejects a duplicate refund idempotency key at the storage layer', () => {
    const base = {
      paymentRef: 'pay_9001',
      customerRef: 'cus_1001',
      amountMinor: 2500,
      currency: 'GBP',
      reason: 'Damaged goods',
      idempotencyKey: 'idem_fixed_key_1',
      status: 'EXECUTED' as const,
      requestedBy: 'user_support_1',
      requestedAt: new Date(0),
      updatedAt: new Date(0),
    };

    ctx.db.insert(refundCaseWorkflow).values({ id: 'rfwf_0001', ...base }).run();

    // The unique index is the last line of defence behind the connector's own idempotency.
    expect(() =>
      ctx.db.insert(refundCaseWorkflow).values({ id: 'rfwf_0002', ...base }).run(),
    ).toThrow();

    expect(ctx.db.select().from(refundCaseWorkflow).all()).toHaveLength(1);
  });
});
