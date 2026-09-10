import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditEvents } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import {
  claimCase,
  decideCase,
  escalateCase,
  getCaseDetail,
  KYC_SUBJECT_TYPE,
  listQueue,
} from '@/features/kyc/service';
import type { KycDeps } from '@/features/kyc/service';
import { requireApiAppAccess } from '@/lib/auth/guards';
import type { Actor } from '@/lib/auth/session';
import { getDemoUser } from '@/lib/auth/users';
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
 * unchanged, and that no ACCEPTED audit row exists for the denied action — because a denial
 * that quietly mutates or logs a success is exactly the failure this app must not have.
 */

const CASES = {
  ordinary: 'kycwf_0001',
  missingDocuments: 'kycwf_0002',
  /** Seeded IN_REVIEW, already held by Casey (Compliance Analyst). */
  pepHit: 'kycwf_0003',
  sanctionsHit: 'kycwf_0004',
  /** Seeded IN_REVIEW, held by Morgan on the Manager / Admin tier (as if escalated). */
  managerHeld: 'kycwf_0005',
} as const;

const MANAGER_TIER_ID = 'user_morgan';

function actorForUser(userId: string): Actor {
  const user = getDemoUser(userId);
  if (!user) throw new Error(`unknown demo user ${userId}`);
  return { id: user.id, role: user.role, displayName: user.name };
}

/** Two analysts on purpose: assignment between people of the same role is the point. */
const compliance = actorForUser('user_casey');
const otherAnalyst = actorForUser('user_dana');
const manager = actorForUser('user_morgan');
const support = actorForUser('user_sam');

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
      now: () => new Date('2026-09-10T09:00:00.000Z'),
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

  /** Claims a case and returns the fresh row, so callers get a current version. */
  async function claim(actor: Actor, caseId: string) {
    const result = await claimCase(deps, actor, {
      caseId,
      expectedVersion: caseRow(caseId).version,
    });
    if (isAppError(result)) throw new Error(`expected claim, got ${result.message}`);
    return result;
  }

  describe('queue', () => {
    it('composes workflow state with provider evidence and customer identity', () => {
      const queue = listQueue(deps, compliance);
      if (isAppError(queue)) throw new Error('expected a queue');

      expect(queue).toHaveLength(11);
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

    it('resolves the "me" assignee filter to the acting reviewer', () => {
      const mine = listQueue(deps, compliance, { assignee: 'me' });
      const managers = listQueue(deps, manager, { assignee: 'me' });
      if (isAppError(mine) || isAppError(managers)) throw new Error('expected queues');

      expect(mine.map((item) => item.id)).toEqual([CASES.pepHit]);
      expect(managers.map((item) => item.id)).toEqual([CASES.managerHeld]);
    });

    it('refuses to list anything for a role without KYC access', () => {
      const queue = listQueue(deps, support);
      expect(isAppError(queue) && queue.code).toBe('FORBIDDEN');
    });
  });

  describe('claiming', () => {
    it('claims an unassigned case for the reviewer and moves it into review', async () => {
      const before = caseRow(CASES.ordinary);
      const result = await claimCase(deps, compliance, {
        caseId: CASES.ordinary,
        expectedVersion: before.version,
      });

      if (isAppError(result)) throw new Error(`expected claim, got ${result.message}`);
      expect(result.assigneeId).toBe(compliance.id);
      expect(result.status).toBe('IN_REVIEW');
      expect(result.version).toBe(before.version + 1);

      const events = auditFor(CASES.ordinary);
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('kyc:assign');
      expect(events[0].outcome).toBe('ACCEPTED');
      expect(JSON.parse(events[0].afterJson!).assigneeId).toBe(compliance.id);
    });

    it('is a no-op when the actor already holds the case', async () => {
      await claim(compliance, CASES.ordinary);
      const held = caseRow(CASES.ordinary);

      const again = await claimCase(deps, compliance, {
        caseId: CASES.ordinary,
        expectedVersion: held.version,
      });

      if (isAppError(again)) throw new Error('expected idempotent claim');
      expect(again.version).toBe(held.version);
      // A retry must not double-write or double-audit.
      expect(auditFor(CASES.ordinary)).toHaveLength(1);
    });

    it('refuses to claim a case another reviewer holds', async () => {
      const before = caseRow(CASES.managerHeld);
      const result = await claimCase(deps, compliance, {
        caseId: CASES.managerHeld,
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('CONFLICT');
      expect(caseRow(CASES.managerHeld)).toEqual(before);
      const events = auditFor(CASES.managerHeld);
      expect(events).toHaveLength(1);
      expect(events[0].outcome).toBe('DENIED');
    });

    it('lets the override tier take over a held case', async () => {
      const before = caseRow(CASES.pepHit);
      expect(before.assigneeId).toBe(compliance.id);

      const result = await claimCase(deps, manager, {
        caseId: CASES.pepHit,
        expectedVersion: before.version,
      });

      if (isAppError(result)) throw new Error(`expected take-over, got ${result.message}`);
      expect(result.assigneeId).toBe(manager.id);
    });

    it('refuses to claim a decided case', async () => {
      await claim(compliance, CASES.ordinary);
      await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Verified.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      const before = caseRow(CASES.ordinary);
      const result = await claimCase(deps, manager, {
        caseId: CASES.ordinary,
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('CONFLICT');
      expect(caseRow(CASES.ordinary)).toEqual(before);
    });

    it('refuses a claim from a role without KYC access', async () => {
      const before = caseRow(CASES.ordinary);
      const result = await claimCase(deps, support, {
        caseId: CASES.ordinary,
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.ordinary)).toEqual(before);
      expect(auditFor(CASES.ordinary).every((e) => e.outcome === 'DENIED')).toBe(true);
    });
  });

  describe('a second Compliance Analyst', () => {
    it('cannot decide a case held by another analyst, even though the role can decide', async () => {
      await claim(compliance, CASES.ordinary);
      const held = caseRow(CASES.ordinary);

      const result = await decideCase(deps, otherAnalyst, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Same role, different person.',
        expectedVersion: held.version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.ordinary)).toEqual(held);

      const denied = auditFor(CASES.ordinary).filter((e) => e.outcome === 'DENIED');
      expect(denied).toHaveLength(1);
      expect(denied[0].actorId).toBe(otherAnalyst.id);
    });

    it('cannot claim or escalate a case held by another analyst', async () => {
      await claim(compliance, CASES.ordinary);
      const held = caseRow(CASES.ordinary);

      const claimAttempt = await claimCase(deps, otherAnalyst, {
        caseId: CASES.ordinary,
        expectedVersion: held.version,
      });
      const escalateAttempt = await escalateCase(deps, otherAnalyst, {
        caseId: CASES.ordinary,
        reason: 'Handing off a case that is not mine.',
        expectedVersion: held.version,
      });

      expect(isAppError(claimAttempt) && claimAttempt.code).toBe('CONFLICT');
      expect(isAppError(escalateAttempt) && escalateAttempt.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.ordinary)).toEqual(held);
      expect(auditFor(CASES.ordinary).every((e) => e.outcome !== 'ACCEPTED' || e.action === 'kyc:assign')).toBe(true);
    });

    it('sees the other analyst\'s held case under their name, not "me"', async () => {
      await claim(compliance, CASES.ordinary);

      const mine = listQueue(deps, otherAnalyst, { assignee: 'me' });
      const caseys = listQueue(deps, otherAnalyst, { assignee: compliance.id });
      if (isAppError(mine) || isAppError(caseys)) throw new Error('expected queues');

      expect(mine.map((item) => item.id)).not.toContain(CASES.ordinary);
      expect(caseys.map((item) => item.id)).toContain(CASES.ordinary);
    });
  });

  describe('ordinary decisions', () => {
    it('lets Compliance claim then approve a complete case, recorded in the case audit timeline', async () => {
      await claim(compliance, CASES.ordinary);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Documents verified, no adverse findings.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      if (isAppError(result)) throw new Error(`expected approval, got ${result.message}`);
      expect(result.status).toBe('APPROVED');
      expect(result.decidedBy).toBe(compliance.id);
      expect(result.decisionReason).toBe('Documents verified, no adverse findings.');

      // Timestamps have ms resolution, so don't rely on list order for same-ms events.
      const events = auditFor(CASES.ordinary);
      expect(new Set(events.map((e) => e.action))).toEqual(new Set(['kyc:assign', 'kyc:decide']));
      expect(events.every((e) => e.outcome === 'ACCEPTED')).toBe(true);
      const decision = events.find((e) => e.action === 'kyc:decide')!;
      expect(decision.reason).toBe('Documents verified, no adverse findings.');
      expect(JSON.parse(decision.beforeJson!).status).toBe('IN_REVIEW');
      expect(JSON.parse(decision.afterJson!).status).toBe('APPROVED');

      // The timeline is case-specific: another case sees none of this.
      expect(auditFor(CASES.missingDocuments)).toHaveLength(0);
    });

    it('refuses a decision on a case the reviewer does not hold', async () => {
      const before = caseRow(CASES.ordinary);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Deciding without claiming.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.ordinary)).toEqual(before);

      const events = auditFor(CASES.ordinary);
      expect(events).toHaveLength(1);
      expect(events[0].outcome).toBe('DENIED');
      expect(events[0].action).toBe('kyc:decide');
    });

    it('rejects a second decision on an already decided case', async () => {
      await claim(compliance, CASES.ordinary);
      await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Documents verified.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      const again = await decideCase(deps, manager, {
        caseId: CASES.ordinary,
        decision: 'REJECT',
        reason: 'Changed my mind.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      expect(isAppError(again) && again.code).toBe('CONFLICT');
      expect(caseRow(CASES.ordinary).status).toBe('APPROVED');
      expect(
        auditFor(CASES.ordinary).filter(
          (e) => e.action === 'kyc:decide' && e.outcome === 'ACCEPTED',
        ),
      ).toHaveLength(1);
    });

    it('rejects a stale version rather than overwriting a concurrent change', async () => {
      const stale = caseRow(CASES.ordinary).version;
      // Another reviewer action moved the version on before this decide landed.
      await claim(compliance, CASES.ordinary);

      const result = await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Reviewed against a stale page.',
        expectedVersion: stale,
      });

      expect(isAppError(result) && result.code).toBe('CONFLICT');
      expect(caseRow(CASES.ordinary).status).toBe('IN_REVIEW');
    });
  });

  describe('required documents', () => {
    it('blocks approval while a required document is outstanding', async () => {
      await claim(compliance, CASES.missingDocuments);
      const before = caseRow(CASES.missingDocuments);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.missingDocuments,
        decision: 'APPROVE',
        reason: 'Looks fine to me.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('PRECONDITION_FAILED');
      expect(caseRow(CASES.missingDocuments)).toEqual(before);

      const decisionEvents = auditFor(CASES.missingDocuments).filter(
        (e) => e.action === 'kyc:decide',
      );
      expect(decisionEvents).toHaveLength(1);
      expect(decisionEvents[0].outcome).toBe('DENIED');
    });

    it('still allows rejection of an incomplete case, with the reason recorded', async () => {
      await claim(compliance, CASES.missingDocuments);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.missingDocuments,
        decision: 'REJECT',
        reason: 'Proof of address never supplied.',
        expectedVersion: caseRow(CASES.missingDocuments).version,
      });

      if (isAppError(result)) throw new Error('expected rejection to be allowed');
      expect(result.status).toBe('REJECTED');
      expect(result.decisionReason).toBe('Proof of address never supplied.');
    });
  });

  describe('sanctions and PEP hits', () => {
    it('refuses approval by Compliance and leaves the case untouched', async () => {
      await claim(compliance, CASES.sanctionsHit);
      const before = caseRow(CASES.sanctionsHit);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.sanctionsHit,
        decision: 'APPROVE',
        reason: 'Believe the match is a false positive.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.sanctionsHit)).toEqual(before);

      const decisionEvents = auditFor(CASES.sanctionsHit).filter(
        (e) => e.action === 'kyc:decide',
      );
      expect(decisionEvents).toHaveLength(1);
      expect(decisionEvents[0].outcome).toBe('DENIED');
      // No audit row anywhere claims this case was decided.
      expect(
        ctx.db
          .select()
          .from(auditEvents)
          .all()
          .some((e) => e.action === 'kyc:decide' && e.outcome === 'ACCEPTED'),
      ).toBe(false);
    });

    it('lets Compliance reject a sanctions hit', async () => {
      await claim(compliance, CASES.sanctionsHit);
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
      await claim(manager, CASES.sanctionsHit);
      const result = await decideCase(deps, manager, {
        caseId: CASES.sanctionsHit,
        decision: 'APPROVE',
        reason: 'Screened against the full list; confirmed false positive.',
        expectedVersion: caseRow(CASES.sanctionsHit).version,
      });

      if (isAppError(result)) throw new Error(`expected override approval, got ${result.message}`);
      expect(result.status).toBe('APPROVED');
      expect(
        auditFor(CASES.sanctionsHit).find((e) => e.action === 'kyc:decide')!.outcome,
      ).toBe('ACCEPTED');
    });

    it('applies the override rule to a PEP hit too', async () => {
      // Seeded as already held by the demo Compliance Analyst.
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

  describe('escalation', () => {
    it('hands a held case to the Manager / Admin tier, with the reason audited', async () => {
      await claim(compliance, CASES.ordinary);
      const held = caseRow(CASES.ordinary);

      const result = await escalateCase(deps, compliance, {
        caseId: CASES.ordinary,
        reason: 'Unusual corporate structure needs manager sign-off.',
        expectedVersion: held.version,
      });

      if (isAppError(result)) throw new Error(`expected escalation, got ${result.message}`);
      expect(result.assigneeId).toBe(MANAGER_TIER_ID);
      expect(result.status).toBe('IN_REVIEW');
      expect(result.version).toBe(held.version + 1);

      const events = auditFor(CASES.ordinary);
      const escalation = events.find((e) => e.action === 'kyc:escalate')!;
      expect(escalation.outcome).toBe('ACCEPTED');
      expect(escalation.reason).toBe('Unusual corporate structure needs manager sign-off.');
      expect(JSON.parse(escalation.afterJson!).assigneeId).toBe(MANAGER_TIER_ID);
    });

    it('the manager sees an escalated case as assigned to them, and can decide it', async () => {
      await claim(compliance, CASES.ordinary);
      await escalateCase(deps, compliance, {
        caseId: CASES.ordinary,
        reason: 'Needs a second pair of eyes.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      const mine = listQueue(deps, manager, { assignee: 'me' });
      if (isAppError(mine)) throw new Error('expected a queue');
      expect(mine.map((item) => item.id)).toContain(CASES.ordinary);

      const result = await decideCase(deps, manager, {
        caseId: CASES.ordinary,
        decision: 'APPROVE',
        reason: 'Manager review complete.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });
      if (isAppError(result)) throw new Error(`expected manager decision, got ${result.message}`);
      expect(result.status).toBe('APPROVED');
    });

    it('the original reviewer no longer holds an escalated case and cannot decide it', async () => {
      await claim(compliance, CASES.ordinary);
      await escalateCase(deps, compliance, {
        caseId: CASES.ordinary,
        reason: 'Above my authority.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      const before = caseRow(CASES.ordinary);
      const result = await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'REJECT',
        reason: 'Rejecting anyway.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.ordinary)).toEqual(before);
    });

    it('refuses to escalate a case the actor does not hold', async () => {
      const before = caseRow(CASES.missingDocuments);
      const result = await escalateCase(deps, compliance, {
        caseId: CASES.missingDocuments,
        reason: 'Escalating an unclaimed case.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('FORBIDDEN');
      expect(caseRow(CASES.missingDocuments)).toEqual(before);
      expect(auditFor(CASES.missingDocuments).every((e) => e.outcome === 'DENIED')).toBe(true);
    });

    it('refuses to escalate above the top review tier', async () => {
      const before = caseRow(CASES.managerHeld);
      expect(before.assigneeId).toBe(manager.id);

      const result = await escalateCase(deps, manager, {
        caseId: CASES.managerHeld,
        reason: 'Nowhere to send this.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('CONFLICT');
      expect(caseRow(CASES.managerHeld)).toEqual(before);
    });

    it('refuses to escalate a decided case', async () => {
      await claim(compliance, CASES.ordinary);
      await decideCase(deps, compliance, {
        caseId: CASES.ordinary,
        decision: 'REJECT',
        reason: 'Failed verification.',
        expectedVersion: caseRow(CASES.ordinary).version,
      });

      const before = caseRow(CASES.ordinary);
      const result = await escalateCase(deps, compliance, {
        caseId: CASES.ordinary,
        reason: 'Escalating a closed case.',
        expectedVersion: before.version,
      });

      expect(isAppError(result) && result.code).toBe('CONFLICT');
      expect(caseRow(CASES.ordinary)).toEqual(before);
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
      await claim(compliance, CASES.ordinary);
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
      expect(detail.audit).toHaveLength(2);
    });

    it('reports an unknown case as not found', () => {
      const detail = getCaseDetail(deps, compliance, 'kycwf_missing');
      expect(isAppError(detail) && detail.code).toBe('NOT_FOUND');
    });
  });
});
