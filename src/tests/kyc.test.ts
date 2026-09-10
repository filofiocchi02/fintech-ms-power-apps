import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditEvents } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import { KYC_SUBJECT_TYPE, decideCase, getCaseDetail, listQueue } from '@/features/kyc/service';
import type { KycDeps } from '@/features/kyc/service';
import { requireApiAppAccess } from '@/lib/auth/guards';
import type { Actor } from '@/lib/auth/session';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { isAppError } from '@/lib/errors/errors';
import { customerConnector } from '@/lib/integrations/mock/customers';
import { kycReviewProviderConnector } from '@/lib/integrations/mock/kyc';
import { createAuditSink } from '@/lib/repositories/sqlite/audit';
import { createWorkflowRepository } from '@/lib/repositories/sqlite/workflow';

import { createTestDb } from './helpers/db';

/**
 * KYC review behaviour, exercised against the real repositories on an isolated database.
 *
 * The negative paths assert three things together — the typed error, that workflow state is
 * unchanged, and that no ACCEPTED audit row exists — because a denial that quietly mutates
 * or logs a success is exactly the failure this app must not have.
 */

const CASES = {
  ordinary: 'kycwf_0001',
  missingDocuments: 'kycwf_0002',
  pepHit: 'kycwf_0003',
  sanctionsHit: 'kycwf_0004',
} as const;

function actorFor(role: Role): Actor {
  return { id: `demo_${role}`, role, displayName: ROLE_LABELS[role] };
}

const compliance = actorFor('compliance');
const manager = actorFor('manager-admin');
const support = actorFor('support');

describe('KYC review', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let deps: KycDeps;

  beforeEach(() => {
    ctx = createTestDb();
    seedDatabase(ctx.db);
    deps = {
      workflow: createWorkflowRepository(ctx.db),
      audit: createAuditSink(ctx.db),
      customers: customerConnector,
      provider: kycReviewProviderConnector,
      now: () => new Date('2026-01-12T09:00:00.000Z'),
    };
  });

  afterEach(() => {
    ctx.cleanup();
  });

  function caseRow(id: string) {
    return deps.workflow.getKycCaseById(id)!;
  }

  function auditFor(id: string) {
    return deps.audit.listForSubject(KYC_SUBJECT_TYPE, id);
  }

  describe('queue', () => {
    it('composes workflow state with provider evidence and customer identity', () => {
      const queue = listQueue(deps, compliance);
      if (isAppError(queue)) throw new Error('expected a queue');

      expect(queue).toHaveLength(6);
      const first = queue[0];
      expect(first.customerName).toBe('Acme Corp');
      expect(first.country).toBe('GB');
      expect(first.riskLevel).toBe('low');
      expect(first.ageHours).toBeGreaterThan(0);
    });

    it('combines filters server-side', () => {
      const queue = listQueue(deps, compliance, { risk: 'high', country: 'US' });
      if (isAppError(queue)) throw new Error('expected a queue');

      expect(queue.map((item) => item.id)).toEqual([CASES.sanctionsHit]);
    });

    it('matches customers by name or reference', () => {
      const byName = listQueue(deps, compliance, { search: 'gamma' });
      const byRef = listQueue(deps, compliance, { search: 'cus_1003' });
      if (isAppError(byName) || isAppError(byRef)) throw new Error('expected queues');

      expect(byName.map((item) => item.id)).toEqual([CASES.pepHit]);
      expect(byRef.map((item) => item.id)).toEqual([CASES.pepHit]);
    });

    it('refuses to list anything for a role without KYC access', () => {
      const queue = listQueue(deps, support);
      expect(isAppError(queue) && queue.code).toBe('FORBIDDEN');
    });
  });

  describe('ordinary decisions', () => {
    it('lets Compliance approve a complete case and records it in that case audit timeline', async () => {
      const before = caseRow(CASES.ordinary);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Documents verified, no adverse findings.',
        expectedVersion: before.version,
      });

      if (isAppError(result)) throw new Error(`expected approval, got ${result.message}`);
      expect(result.status).toBe('APPROVED');
      expect(result.decidedBy).toBe(compliance.id);
      expect(result.decisionReason).toBe('Documents verified, no adverse findings.');

      const events = auditFor(CASES.ordinary);
      expect(events).toHaveLength(1);
      expect(events[0].outcome).toBe('ACCEPTED');
      expect(events[0].reason).toBe('Documents verified, no adverse findings.');
      expect(JSON.parse(events[0].beforeJson!).status).toBe('OPEN');
      expect(JSON.parse(events[0].afterJson!).status).toBe('APPROVED');

      // The timeline is case-specific: another case sees none of this.
      expect(auditFor(CASES.missingDocuments)).toHaveLength(0);
    });

    it('rejects a second decision on an already decided case', async () => {
      const before = caseRow(CASES.ordinary);
      await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Documents verified.',
        expectedVersion: before.version,
      });

      const again = await decideCase(deps, manager, {
        caseId: CASES.ordinary,
        decision: 'REJECT',
        reason: 'Changed my mind.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      expect(isAppError(again) && again.code).toBe('CONFLICT');
      expect(caseRow(CASES.ordinary).status).toBe('APPROVED');
      expect(auditFor(CASES.ordinary).filter((e) => e.outcome === 'ACCEPTED')).toHaveLength(1);
    });

    it('rejects a stale version rather than overwriting a concurrent decision', async () => {
      const stale = caseRow(CASES.pepHit).version;
      await decideCase(deps, manager, {
        caseId: CASES.pepHit,
        decision: 'REJECT',
        reason: 'PEP relationship unverified.',
        expectedVersion: stale,
      });

      const result = await decideCase(deps, manager, {
        caseId: CASES.pepHit,
        decision: 'APPROVE',
        reason: 'Second reviewer disagrees.',
        expectedVersion: stale,
      });

      expect(isAppError(result) && result.code).toBe('CONFLICT');
      expect(caseRow(CASES.pepHit).status).toBe('REJECTED');
    });
  });

  describe('required documents', () => {
    it('blocks approval while a required document is outstanding', async () => {
      const before = caseRow(CASES.missingDocuments);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.missingDocuments,
        decision: 'APPROVE',
        reason: 'Looks fine to me.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('PRECONDITION_FAILED');
      expect(caseRow(CASES.missingDocuments)).toEqual(before);
      expect(auditFor(CASES.missingDocuments).every((e) => e.outcome === 'DENIED')).toBe(true);
    });

    it('still allows rejection of an incomplete case, with the reason recorded', async () => {
      const before = caseRow(CASES.missingDocuments);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.missingDocuments,
        decision: 'REJECT',
        reason: 'Proof of address never supplied.',
        expectedVersion: before.version,
      });

      if (isAppError(result)) throw new Error('expected rejection to be allowed');
      expect(result.status).toBe('REJECTED');
      expect(result.decisionReason).toBe('Proof of address never supplied.');
    });
  });

  describe('sanctions and PEP hits', () => {
    it('refuses approval by Compliance and leaves the case untouched', async () => {
      const before = caseRow(CASES.sanctionsHit);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.sanctionsHit,
        decision: 'APPROVE',
        reason: 'Believe the match is a false positive.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.sanctionsHit)).toEqual(before);

      const events = auditFor(CASES.sanctionsHit);
      expect(events).toHaveLength(1);
      expect(events[0].outcome).toBe('DENIED');
      expect(ctx.db.select().from(auditEvents).all().some((e) => e.outcome === 'ACCEPTED')).toBe(false);
    });

    it('lets Compliance reject a sanctions hit', async () => {
      const result = await decideCase(deps, compliance, {
        caseId: CASES.sanctionsHit,
        decision: 'REJECT',
        reason: 'Confirmed sanctions match.',
        expectedVersion: caseRow(CASES.sanctionsHit).version,
      });

      expect(isAppError(result)).toBe(false);
      expect(caseRow(CASES.sanctionsHit).status).toBe('REJECTED');
    });

    it('allows Manager / Admin to approve a sanctions hit as an override', async () => {
      const result = await decideCase(deps, manager, {
        caseId: CASES.sanctionsHit,
        decision: 'APPROVE',
        reason: 'Screened against the full list; confirmed false positive.',
        expectedVersion: caseRow(CASES.sanctionsHit).version,
      });

      if (isAppError(result)) throw new Error(`expected override approval, got ${result.message}`);
      expect(result.status).toBe('APPROVED');
      expect(auditFor(CASES.sanctionsHit)[0].outcome).toBe('ACCEPTED');
    });

    it('applies the override rule to a PEP hit too', async () => {
      const result = await decideCase(deps, compliance, {
        caseId: CASES.pepHit,
        decision: 'APPROVE',
        reason: 'PEP status is historic.',
        expectedVersion: caseRow(CASES.pepHit).version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.pepHit).status).toBe('IN_REVIEW');
    });
  });

  describe('Support Agent', () => {
    it('is refused KYC app access by the API guard', () => {
      const access = requireApiAppAccess(support, 'kyc');
      expect(access.success).toBe(false);
      expect(!access.success && access.error.code).toBe('FORBIDDEN');
    });

    it('cannot read a case detail', () => {
      const detail = getCaseDetail(deps, support, CASES.ordinary);
      expect(isAppError(detail) && detail.code).toBe('FORBIDDEN');
    });

    it('cannot decide a case, and the attempt neither mutates nor logs a success', async () => {
      const before = caseRow(CASES.ordinary);
      const result = await decideCase(deps, support, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Approving on behalf of compliance.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.ordinary)).toEqual(before);

      const events = auditFor(CASES.ordinary);
      expect(events).toHaveLength(1);
      expect(events[0].outcome).toBe('DENIED');
      expect(events[0].actorRole).toBe('support');
    });
  });

  describe('case detail', () => {
    it('returns provider evidence, customer identity and the audit timeline together', async () => {
      await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Verified.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      const detail = getCaseDetail(deps, compliance, CASES.ordinary);
      if (isAppError(detail)) throw new Error('expected a detail view');

      expect(detail.customer.displayName).toBe('Acme Corp');
      expect(detail.evidence.referralReason).toBeTruthy();
      expect(detail.evidence.documents.length).toBeGreaterThan(0);
      expect(detail.workflow.status).toBe('APPROVED');
      expect(detail.audit).toHaveLength(1);
    });

    it('reports an unknown case as not found', () => {
      const detail = getCaseDetail(deps, compliance, 'kycwf_missing');
      expect(isAppError(detail) && detail.code).toBe('NOT_FOUND');
    });
  });
});
