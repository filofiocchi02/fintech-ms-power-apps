import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditEvents } from '@/db/schema';
import type { FlagDeps } from '@/features/flags/service';
import type { Actor } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/roles';
import { featureFlagConnector, resetMockFeatureFlags } from '@/lib/integrations/mock/feature-flags';
import { createAuditSink } from '@/lib/repositories/sqlite/audit';

import { createTestDb } from './helpers/db';

/**
 * Behaviour of the feature-flag tool under adversarial use.
 *
 * The interesting assertions are the negative ones: a denied request must leave the
 * connector untouched and must not produce an ACCEPTED audit row, whichever layer denied it.
 */

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  deps: null as FlagDeps | null,
}));

vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getCurrentUser: async () => state.actor,
}));

vi.mock('@/features/flags/deps', () => ({
  flagDeps: () => {
    if (!state.deps) throw new Error('test deps not initialised');
    return state.deps;
  },
}));

const { GET: listRoute } = await import('@/app/api/flags/route');
const { GET: detailRoute, PATCH: changeRoute } = await import('@/app/api/flags/[key]/route');

const ACTORS: Record<Role, Actor> = {
  support: { id: 'user_support_1', role: 'support', displayName: 'Support Agent' },
  compliance: { id: 'user_compliance_1', role: 'compliance', displayName: 'Compliance Analyst' },
  'release-engineer': {
    id: 'user_release_1',
    role: 'release-engineer',
    displayName: 'Release Engineer',
  },
  'manager-admin': { id: 'user_admin_1', role: 'manager-admin', displayName: 'Manager / Admin' },
};

const FLAG_KEY = 'new-dashboard';

let ctx: ReturnType<typeof createTestDb>;

function actAs(role: Role | null) {
  state.actor = role ? ACTORS[role] : null;
}

function patch(key: string, body: unknown) {
  return changeRoute(
    new Request(`http://localhost/api/flags/${key}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ key }) },
  );
}

function list(search: string) {
  return listRoute(new Request(`http://localhost/api/flags${search}`));
}

function detail(key: string, search: string) {
  return detailRoute(new Request(`http://localhost/api/flags/${key}${search}`), {
    params: Promise.resolve({ key }),
  });
}

function auditRows() {
  return ctx.db.select().from(auditEvents).all();
}

beforeEach(() => {
  ctx = createTestDb();
  state.deps = { connector: featureFlagConnector, audit: createAuditSink(ctx.db) };
  resetMockFeatureFlags();
  actAs(null);
});

afterEach(() => {
  ctx.cleanup();
  state.deps = null;
});

describe('flag access', () => {
  it('denies unauthenticated API reads', async () => {
    const response = await list('?environment=dev');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it.each(['support', 'compliance'] as const)('denies %s access to the flags API', async (role) => {
    actAs(role);

    const listResponse = await list('?environment=dev');
    expect(listResponse.status).toBe(403);
    expect(JSON.stringify(await listResponse.json())).not.toContain(FLAG_KEY);

    const detailResponse = await detail(FLAG_KEY, '?environment=dev');
    expect(detailResponse.status).toBe(403);

    const patchResponse = await patch(FLAG_KEY, { environment: 'dev', enabled: false });
    expect(patchResponse.status).toBe(403);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'dev')?.enabled).toBe(true);
    expect(auditRows().filter((row) => row.outcome === 'ACCEPTED')).toHaveLength(0);
  });

  it.each(['release-engineer', 'manager-admin'] as const)('allows %s to read flags', async (role) => {
    actAs(role);

    const response = await list('?environment=dev');
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { data: { flags: { key: string }[] } };
    expect(payload.data.flags.some((flag) => flag.key === FLAG_KEY)).toBe(true);
  });

  it('requires an explicit environment on every read', async () => {
    actAs('release-engineer');
    expect((await list('')).status).toBe(400);
    expect((await list('?environment=prod')).status).toBe(400);
  });

  it('searches by key and description', async () => {
    actAs('release-engineer');

    const response = await list('?environment=dev&q=dashboard');
    const payload = (await response.json()) as { data: { flags: { key: string }[] } };

    expect(payload.data.flags).toHaveLength(1);
    expect(payload.data.flags[0].key).toBe(FLAG_KEY);
  });
});

describe('non-production changes', () => {
  it('lets a Release Engineer disable a dev flag through the connector', async () => {
    actAs('release-engineer');

    const response = await patch(FLAG_KEY, {
      environment: 'dev',
      enabled: false,
      reason: 'Testing the new dashboard rollback path',
    });

    expect(response.status).toBe(200);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'dev')?.enabled).toBe(false);

    const accepted = auditRows().filter((row) => row.outcome === 'ACCEPTED');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({
      app: 'flags',
      actorRole: 'release-engineer',
      subjectRef: `dev:${FLAG_KEY}`,
      reason: 'Testing the new dashboard rollback path',
    });
    expect(JSON.parse(accepted[0].beforeJson ?? '{}')).toMatchObject({
      environment: 'dev',
      enabled: true,
    });
    expect(JSON.parse(accepted[0].afterJson ?? '{}')).toMatchObject({
      environment: 'dev',
      enabled: false,
    });
  });

  it('lets a Release Engineer change the staging rollout percentage', async () => {
    actAs('release-engineer');

    const response = await patch(FLAG_KEY, {
      environment: 'staging',
      rolloutPercentage: 35,
      reason: 'Widen the staging cohort',
    });

    expect(response.status).toBe(200);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'staging')?.rolloutPercentage).toBe(35);
  });

  it('rejects an out-of-range rollout percentage without mutating anything', async () => {
    actAs('release-engineer');
    const before = featureFlagConnector.getFlag(FLAG_KEY, 'staging')?.rolloutPercentage;

    const response = await patch(FLAG_KEY, { environment: 'staging', rolloutPercentage: 140 });

    expect(response.status).toBe(400);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'staging')?.rolloutPercentage).toBe(before);
    expect(auditRows().filter((row) => row.outcome === 'ACCEPTED')).toHaveLength(0);
  });

  it('reports an applied change whose audit write failed as applied, not as a failure', async () => {
    actAs('release-engineer');
    const audit = state.deps!.audit;
    state.deps = {
      connector: featureFlagConnector,
      audit: {
        ...audit,
        emit: async (event) => {
          if (event.outcome === 'ACCEPTED') throw new Error('audit sink unavailable');
          return audit.emit(event);
        },
      },
    };

    const response = await patch(FLAG_KEY, { environment: 'dev', enabled: false });

    // The flag moved, so the operator must not be told to retry.
    expect(response.status).toBe(500);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'dev')?.enabled).toBe(false);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { message: expect.stringContaining('Do not retry') },
    });
  });

  it('changes one dimension per request', async () => {
    actAs('release-engineer');

    const both = await patch(FLAG_KEY, { environment: 'dev', enabled: false, rolloutPercentage: 10 });
    expect(both.status).toBe(400);

    const neither = await patch(FLAG_KEY, { environment: 'dev' });
    expect(neither.status).toBe(400);
  });
});

describe('production changes', () => {
  const reason = 'Incident 1421: disable the risky path';

  it('refuses a Release Engineer even with a correct confirmation and reason', async () => {
    actAs('release-engineer');
    const before = featureFlagConnector.getFlag(FLAG_KEY, 'production');

    const response = await patch(FLAG_KEY, {
      environment: 'production',
      enabled: !before?.enabled,
      reason,
      confirmation: FLAG_KEY,
    });

    expect(response.status).toBe(403);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'production')?.enabled).toBe(before?.enabled);

    const rows = auditRows();
    expect(rows.filter((row) => row.outcome === 'ACCEPTED')).toHaveLength(0);
    expect(rows.filter((row) => row.outcome === 'DENIED')).toHaveLength(1);
  });

  it('lets a Manager / Admin change production after the exact typed confirmation', async () => {
    actAs('manager-admin');
    const before = featureFlagConnector.getFlag(FLAG_KEY, 'production');

    const response = await patch(FLAG_KEY, {
      environment: 'production',
      enabled: !before?.enabled,
      reason,
      confirmation: FLAG_KEY,
    });

    expect(response.status).toBe(200);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'production')?.enabled).toBe(!before?.enabled);

    const accepted = auditRows().filter((row) => row.outcome === 'ACCEPTED');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ subjectRef: `production:${FLAG_KEY}`, reason });
  });

  it('rejects a wrong or missing typed confirmation', async () => {
    actAs('manager-admin');
    const before = featureFlagConnector.getFlag(FLAG_KEY, 'production');

    const wrong = await patch(FLAG_KEY, {
      environment: 'production',
      enabled: !before?.enabled,
      reason,
      confirmation: 'new-dashboardd',
    });
    expect(wrong.status).toBe(400);

    const missing = await patch(FLAG_KEY, {
      environment: 'production',
      enabled: !before?.enabled,
      reason,
    });
    expect(missing.status).toBe(400);

    expect(featureFlagConnector.getFlag(FLAG_KEY, 'production')?.enabled).toBe(before?.enabled);
    expect(auditRows().filter((row) => row.outcome === 'ACCEPTED')).toHaveLength(0);
  });

  it('rejects a production change with no reason', async () => {
    actAs('manager-admin');
    const before = featureFlagConnector.getFlag(FLAG_KEY, 'production');

    const response = await patch(FLAG_KEY, {
      environment: 'production',
      rolloutPercentage: 5,
      confirmation: FLAG_KEY,
    });

    expect(response.status).toBe(400);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'production')?.rolloutPercentage).toBe(
      before?.rolloutPercentage,
    );
  });
});

describe('targeting rules', () => {
  it('lets a Release Engineer replace the cohorts of a dev flag', async () => {
    actAs('release-engineer');

    const response = await patch(FLAG_KEY, {
      environment: 'dev',
      targeting: [{ cohort: 'internal-staff', description: 'Employees only' }],
      reason: 'Narrow the dev cohort',
    });

    expect(response.status).toBe(200);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'dev')?.targeting).toEqual([
      { cohort: 'internal-staff', description: 'Employees only' },
    ]);
    expect(featureFlagConnector.getHistory(FLAG_KEY, 'dev')[0]).toMatchObject({
      changeKind: 'targeting',
    });
  });

  it('records the cohorts before and after in the app audit', async () => {
    actAs('release-engineer');

    await patch(FLAG_KEY, {
      environment: 'dev',
      targeting: [{ cohort: 'beta-tenants', description: 'Opted in' }],
      reason: 'Swap the dev cohort',
    });

    const accepted = auditRows().filter((row) => row.outcome === 'ACCEPTED');
    expect(JSON.parse(accepted[0].beforeJson ?? 'null')).toMatchObject({
      targeting: ['internal-staff'],
    });
    expect(JSON.parse(accepted[0].afterJson ?? 'null')).toMatchObject({
      targeting: ['beta-tenants'],
    });
  });

  it('rejects malformed, duplicate and oversized cohorts without mutating anything', async () => {
    actAs('release-engineer');
    const before = featureFlagConnector.getFlag(FLAG_KEY, 'dev')?.targeting;

    const malformed = await patch(FLAG_KEY, {
      environment: 'dev',
      targeting: [{ cohort: 'Not A Cohort', description: '' }],
    });
    expect(malformed.status).toBe(400);

    const duplicate = await patch(FLAG_KEY, {
      environment: 'dev',
      targeting: [
        { cohort: 'internal-staff', description: 'One' },
        { cohort: 'internal-staff', description: 'Two' },
      ],
    });
    expect(duplicate.status).toBe(409);

    const tooMany = await patch(FLAG_KEY, {
      environment: 'dev',
      targeting: Array.from({ length: 11 }, (_, i) => ({ cohort: `c-${i}`, description: '' })),
    });
    expect(tooMany.status).toBe(400);

    expect(featureFlagConnector.getFlag(FLAG_KEY, 'dev')?.targeting).toEqual(before);
    expect(auditRows().filter((row) => row.outcome === 'ACCEPTED')).toHaveLength(0);
  });

  it('refuses malformed cohorts at the connector, not only at the route', () => {
    const before = featureFlagConnector.getFlag(FLAG_KEY, 'dev')?.targeting;

    const result = featureFlagConnector.setTargeting(
      FLAG_KEY,
      'dev',
      [{ cohort: 'Not A Cohort', description: 'x'.repeat(200) }],
      'demo_release_engineer',
      'direct call',
    );

    expect(result).toHaveProperty('error');
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'dev')?.targeting).toEqual(before);
  });

  it('refuses a production targeting change without confirmation', async () => {
    actAs('manager-admin');
    const before = featureFlagConnector.getFlag(FLAG_KEY, 'production')?.targeting;

    const response = await patch(FLAG_KEY, {
      environment: 'production',
      targeting: [{ cohort: 'everyone', description: 'All tenants' }],
      reason: 'Widen the audience',
    });

    expect(response.status).toBe(400);
    expect(featureFlagConnector.getFlag(FLAG_KEY, 'production')?.targeting).toEqual(before);
  });
});

describe('rollback', () => {
  const ROLLED_BACK = 'risk-scoring-v2';

  it('restores an earlier recorded state and records the rollback as a new entry', async () => {
    actAs('release-engineer');
    const target = featureFlagConnector
      .getHistory(ROLLED_BACK, 'staging')
      .find((entry) => entry.rolloutPercentage === 5)!;

    const response = await patch(ROLLED_BACK, {
      environment: 'staging',
      rollbackTo: target.id,
      reason: 'Soak regressed, return to 5%',
    });

    expect(response.status).toBe(200);
    expect(featureFlagConnector.getFlag(ROLLED_BACK, 'staging')?.rolloutPercentage).toBe(5);

    const history = featureFlagConnector.getHistory(ROLLED_BACK, 'staging');
    expect(history[0]).toMatchObject({ changeKind: 'rollback', rolloutPercentage: 5 });
    // The restored entry is still there: a rollback adds to history, it does not rewrite it.
    expect(history.some((entry) => entry.id === target.id)).toBe(true);
  });

  it('refuses a history entry that belongs to another flag or environment', async () => {
    actAs('release-engineer');
    const foreign = featureFlagConnector.getHistory(ROLLED_BACK, 'production')[0];
    const before = featureFlagConnector.getFlag(ROLLED_BACK, 'staging');

    const response = await patch(ROLLED_BACK, {
      environment: 'staging',
      rollbackTo: foreign.id,
      reason: 'Try to restore something from elsewhere',
    });

    expect(response.status).toBe(409);
    expect(featureFlagConnector.getFlag(ROLLED_BACK, 'staging')).toMatchObject({
      enabled: before?.enabled,
      rolloutPercentage: before?.rolloutPercentage,
    });
    expect(auditRows().filter((row) => row.outcome === 'ACCEPTED')).toHaveLength(0);
  });

  it('refuses a production rollback by a Release Engineer, and requires confirmation from a Manager', async () => {
    const target = featureFlagConnector.getHistory(ROLLED_BACK, 'production')[0];
    const before = featureFlagConnector.getFlag(ROLLED_BACK, 'production');

    actAs('release-engineer');
    const denied = await patch(ROLLED_BACK, {
      environment: 'production',
      rollbackTo: target.id,
      reason: 'Revert the ramp',
      confirmation: ROLLED_BACK,
    });
    expect(denied.status).toBe(403);

    actAs('manager-admin');
    const unconfirmed = await patch(ROLLED_BACK, {
      environment: 'production',
      rollbackTo: target.id,
      reason: 'Revert the ramp',
    });
    expect(unconfirmed.status).toBe(400);

    const confirmed = await patch(ROLLED_BACK, {
      environment: 'production',
      rollbackTo: target.id,
      reason: 'Revert the ramp',
      confirmation: ROLLED_BACK,
    });
    expect(confirmed.status).toBe(200);

    expect(featureFlagConnector.getFlag(ROLLED_BACK, 'production')).toMatchObject({
      enabled: target.enabled,
      rolloutPercentage: target.rolloutPercentage,
    });
    expect(before).not.toBeNull();
  });
});

describe('history ownership', () => {
  it('keeps flag values and history in the connector, not in SQLite', async () => {
    actAs('manager-admin');

    await patch(FLAG_KEY, {
      environment: 'dev',
      rolloutPercentage: 60,
      reason: 'Ramp up the dev cohort',
    });

    const connectorHistory = featureFlagConnector.getHistory(FLAG_KEY, 'dev');
    expect(connectorHistory).toHaveLength(1);
    expect(connectorHistory[0]).toMatchObject({ changeKind: 'rollout', rolloutPercentage: 60 });

    // The audit row references the flag; it never stores the flag itself as workflow state.
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].subjectType).toBe('flag');
  });

  it('returns connector history and app audit as separate lists', async () => {
    actAs('manager-admin');
    await patch(FLAG_KEY, { environment: 'dev', enabled: false, reason: 'Pause the rollout' });

    const response = await detail(FLAG_KEY, '?environment=dev');
    const payload = (await response.json()) as {
      data: { connectorHistory: unknown[]; appAudit: unknown[] };
    };

    expect(payload.data.connectorHistory).toHaveLength(1);
    expect(payload.data.appAudit).toHaveLength(1);
  });

  it('scopes app audit to the environment that was changed', async () => {
    actAs('manager-admin');
    await patch(FLAG_KEY, { environment: 'dev', enabled: false, reason: 'Pause the rollout' });

    const response = await detail(FLAG_KEY, '?environment=staging');
    const payload = (await response.json()) as { data: { appAudit: unknown[] } };

    expect(payload.data.appAudit).toHaveLength(0);
  });
});
