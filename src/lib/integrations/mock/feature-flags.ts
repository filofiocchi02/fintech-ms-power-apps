import 'server-only';

import type {
  AdminFeatureFlag,
  AdminFlagHistoryEntry,
  FlagAdminConnector,
  FlagChangeKind,
  FlagTargetingRule,
} from '@/features/flags/contracts';

import type { FlagEnvironment } from '../types';

const EPOCH = Date.parse('2026-01-05T09:00:00.000Z');
const days = (n: number) => n * 24 * 60 * 60 * 1000;

const flagKeys = ['new-dashboard', 'risk-scoring-v2', 'instant-payouts', 'kyc-auto-approve'];

type FlagSeed = {
  key: string;
  description: string;
  targeting: Record<FlagEnvironment, readonly FlagTargetingRule[]>;
  values: Record<
    FlagEnvironment,
    { enabled: boolean; rolloutPercentage: number; lastModifiedBy: string; ageDays: number }
  >;
};

const INTERNAL_STAFF: FlagTargetingRule = {
  cohort: 'internal-staff',
  description: 'Employees and contractors, always on',
};

const FLAG_SEEDS: readonly FlagSeed[] = [
  {
    key: 'new-dashboard',
    description: 'React 19 operations console shell',
    targeting: {
      dev: [INTERNAL_STAFF],
      staging: [INTERNAL_STAFF],
      production: [INTERNAL_STAFF, { cohort: 'beta-tenants', description: '18 opted-in tenants' }],
    },
    values: {
      dev: { enabled: true, rolloutPercentage: 100, lastModifiedBy: 'user_riley', ageDays: 10 },
      staging: { enabled: true, rolloutPercentage: 50, lastModifiedBy: 'user_riley', ageDays: 7 },
      production: { enabled: false, rolloutPercentage: 0, lastModifiedBy: 'user_morgan', ageDays: 12 },
    },
  },
  {
    key: 'risk-scoring-v2',
    description: 'Updated risk model for KYC and refunds',
    targeting: {
      dev: [INTERNAL_STAFF],
      staging: [{ cohort: 'eu-tenants', description: 'EU region tenants only' }],
      production: [{ cohort: 'eu-tenants', description: 'EU region tenants only' }],
    },
    values: {
      dev: { enabled: true, rolloutPercentage: 100, lastModifiedBy: 'user_riley', ageDays: 5 },
      staging: { enabled: true, rolloutPercentage: 25, lastModifiedBy: 'user_riley', ageDays: 3 },
      production: { enabled: true, rolloutPercentage: 10, lastModifiedBy: 'user_morgan', ageDays: 2 },
    },
  },
  {
    key: 'instant-payouts',
    description: 'Immediate refund execution path',
    targeting: {
      dev: [INTERNAL_STAFF],
      staging: [INTERNAL_STAFF],
      production: [{ cohort: 'uk-tenants', description: 'UK region tenants only' }],
    },
    values: {
      dev: { enabled: true, rolloutPercentage: 100, lastModifiedBy: 'user_riley', ageDays: 4 },
      staging: { enabled: false, rolloutPercentage: 0, lastModifiedBy: 'user_riley', ageDays: 2 },
      production: { enabled: false, rolloutPercentage: 0, lastModifiedBy: 'user_morgan', ageDays: 30 },
    },
  },
  {
    key: 'kyc-auto-approve',
    description: 'Auto-approve low-risk KYC cases',
    targeting: {
      dev: [INTERNAL_STAFF],
      staging: [{ cohort: 'low-risk-only', description: 'Provider risk level low' }],
      production: [{ cohort: 'low-risk-only', description: 'Provider risk level low' }],
    },
    values: {
      dev: { enabled: true, rolloutPercentage: 75, lastModifiedBy: 'user_riley', ageDays: 6 },
      staging: { enabled: true, rolloutPercentage: 20, lastModifiedBy: 'user_riley', ageDays: 3 },
      production: { enabled: false, rolloutPercentage: 0, lastModifiedBy: 'user_morgan', ageDays: 1 },
    },
  },
];

const ENVIRONMENTS: readonly FlagEnvironment[] = ['dev', 'staging', 'production'];

function initialFlags(): AdminFeatureFlag[] {
  return FLAG_SEEDS.flatMap((seed) =>
    ENVIRONMENTS.map((environment) => {
      const value = seed.values[environment];
      return {
        key: seed.key,
        environment,
        enabled: value.enabled,
        description: seed.description,
        rolloutPercentage: value.rolloutPercentage,
        targeting: seed.targeting[environment],
        lastModifiedAt: new Date(EPOCH - days(value.ageDays)),
        lastModifiedBy: value.lastModifiedBy,
      } satisfies AdminFeatureFlag;
    }),
  );
}

/**
 * Change history owned by the flag system. It is deliberately pre-populated for a couple of
 * flags: this is the vendor's record of who changed what, and it exists independently of
 * anything the internal tool has done.
 */
function initialHistory(): AdminFlagHistoryEntry[] {
  return [
    {
      id: 'hist_risk_staging_1',
      key: 'risk-scoring-v2',
      environment: 'staging',
      actorId: 'user_riley',
      enabled: true,
      rolloutPercentage: 5,
      targeting: [{ cohort: 'eu-tenants', description: 'EU region tenants only' }],
      changeKind: 'rollout',
      reason: 'Open the staging soak at 5%',
      changedAt: new Date(EPOCH - days(4)),
    },
    {
      id: 'hist_risk_staging_2',
      key: 'risk-scoring-v2',
      environment: 'staging',
      actorId: 'user_riley',
      enabled: true,
      rolloutPercentage: 25,
      targeting: [{ cohort: 'eu-tenants', description: 'EU region tenants only' }],
      changeKind: 'rollout',
      reason: 'Widen staging soak to 25%',
      changedAt: new Date(EPOCH - days(3)),
    },
    {
      id: 'hist_risk_production_1',
      key: 'risk-scoring-v2',
      environment: 'production',
      actorId: 'user_morgan',
      enabled: true,
      rolloutPercentage: 10,
      targeting: [{ cohort: 'eu-tenants', description: 'EU region tenants only' }],
      changeKind: 'rollout',
      reason: 'Start production ramp after staging soak',
      changedAt: new Date(EPOCH - days(2)),
    },
    {
      id: 'hist_kyc_production_1',
      key: 'kyc-auto-approve',
      environment: 'production',
      actorId: 'user_morgan',
      enabled: false,
      rolloutPercentage: 0,
      targeting: [{ cohort: 'low-risk-only', description: 'Provider risk level low' }],
      changeKind: 'enabled',
      reason: 'Paused pending compliance sign-off',
      changedAt: new Date(EPOCH - days(1)),
    },
  ];
}

interface MockFlagState {
  flags: AdminFeatureFlag[];
  history: AdminFlagHistoryEntry[];
  nextHistoryId: number;
}

const MAX_TARGETING_RULES = 10;
const COHORT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_COHORT_LENGTH = 60;
const MAX_COHORT_DESCRIPTION_LENGTH = 160;

/**
 * The stand-in flag system lives in memory, and the bundler gives a page and a Route Handler
 * their own copy of this module, so plain module-level state would let a change made through
 * the API disappear when the page re-read it. Pinning the state to the process keeps one
 * flag system per server, which is what the real connector will be.
 */
const STATE_KEY = Symbol.for('internal-tools.mock.feature-flags');
type StateHost = typeof globalThis & { [STATE_KEY]?: MockFlagState };

function state(): MockFlagState {
  const host = globalThis as StateHost;
  host[STATE_KEY] ??= { flags: initialFlags(), history: initialHistory(), nextHistoryId: 1 };
  return host[STATE_KEY];
}

function findFlag(key: string, environment: FlagEnvironment): AdminFeatureFlag | undefined {
  return state().flags.find((f) => f.key === key && f.environment === environment);
}

function recordChange(flag: AdminFeatureFlag, actorId: string, reason: string, changeKind: FlagChangeKind): void {
  const current = state();
  current.history.push({
    id: `hist_local_${current.nextHistoryId++}`,
    key: flag.key,
    environment: flag.environment,
    actorId,
    enabled: flag.enabled,
    rolloutPercentage: flag.rolloutPercentage,
    targeting: structuredClone(flag.targeting) as FlagTargetingRule[],
    changeKind,
    reason,
    changedAt: new Date(),
  });
}

/** Targeting the flag system will accept: named cohorts, each named once. */
function targetingError(targeting: readonly FlagTargetingRule[]): string | null {
  if (targeting.length > MAX_TARGETING_RULES) {
    return `A flag may have at most ${MAX_TARGETING_RULES} targeting rules`;
  }
  if (targeting.some((rule) => !rule.cohort.trim())) {
    return 'Every targeting rule needs a cohort';
  }
  if (
    targeting.some(
      (rule) =>
        rule.cohort.trim().length > MAX_COHORT_LENGTH ||
        !COHORT_PATTERN.test(rule.cohort.trim()),
    )
  ) {
    return `Cohort names use lowercase letters, numbers and hyphens, up to ${MAX_COHORT_LENGTH} characters`;
  }
  if (targeting.some((rule) => rule.description.trim().length > MAX_COHORT_DESCRIPTION_LENGTH)) {
    return `A cohort description may be at most ${MAX_COHORT_DESCRIPTION_LENGTH} characters`;
  }
  const cohorts = targeting.map((rule) => rule.cohort.trim().toLowerCase());
  if (new Set(cohorts).size !== cohorts.length) {
    return 'Targeting cohorts must be unique';
  }
  return null;
}

export const featureFlagConnector: FlagAdminConnector = {
  getFlag(key: string, environment: FlagEnvironment): AdminFeatureFlag | null {
    const flag = findFlag(key, environment);
    return flag ? structuredClone(flag) : null;
  },
  listFlags(environment: FlagEnvironment): AdminFeatureFlag[] {
    return flagKeys
      .map((key) => findFlag(key, environment))
      .filter((f): f is AdminFeatureFlag => f != null)
      .map((f) => structuredClone(f));
  },
  setFlag(
    key: string,
    environment: FlagEnvironment,
    enabled: boolean,
    actorId: string,
    reason: string,
  ): AdminFeatureFlag | { error: string } {
    const flag = findFlag(key, environment);
    if (!flag) return { error: `Flag ${key} does not exist in ${environment}` };
    if (environment === 'production' && !reason.trim()) {
      return { error: 'Production flag changes require a reason' };
    }

    flag.enabled = enabled;
    flag.lastModifiedAt = new Date();
    flag.lastModifiedBy = actorId;

    recordChange(flag, actorId, reason, 'enabled');

    return structuredClone(flag);
  },
  setRollout(
    key: string,
    environment: FlagEnvironment,
    rolloutPercentage: number,
    actorId: string,
    reason: string,
  ): AdminFeatureFlag | { error: string } {
    const flag = findFlag(key, environment);
    if (!flag) return { error: `Flag ${key} does not exist in ${environment}` };
    if (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) {
      return { error: 'Rollout percentage must be an integer between 0 and 100' };
    }
    if (environment === 'production' && !reason.trim()) {
      return { error: 'Production flag changes require a reason' };
    }

    flag.rolloutPercentage = rolloutPercentage;
    flag.lastModifiedAt = new Date();
    flag.lastModifiedBy = actorId;

    recordChange(flag, actorId, reason, 'rollout');

    return structuredClone(flag);
  },
  setTargeting(
    key: string,
    environment: FlagEnvironment,
    targeting: readonly FlagTargetingRule[],
    actorId: string,
    reason: string,
  ): AdminFeatureFlag | { error: string } {
    const flag = findFlag(key, environment);
    if (!flag) return { error: `Flag ${key} does not exist in ${environment}` };
    const invalid = targetingError(targeting);
    if (invalid) return { error: invalid };
    if (environment === 'production' && !reason.trim()) {
      return { error: 'Production flag changes require a reason' };
    }

    flag.targeting = targeting.map((rule) => ({
      cohort: rule.cohort.trim(),
      description: rule.description.trim(),
    }));
    flag.lastModifiedAt = new Date();
    flag.lastModifiedBy = actorId;

    recordChange(flag, actorId, reason, 'targeting');

    return structuredClone(flag);
  },
  rollbackTo(
    key: string,
    environment: FlagEnvironment,
    historyId: string,
    actorId: string,
    reason: string,
  ): AdminFeatureFlag | { error: string } {
    const flag = findFlag(key, environment);
    if (!flag) return { error: `Flag ${key} does not exist in ${environment}` };

    // The entry has to belong to this flag and environment: an id from elsewhere must not
    // become a way to write a state that was never true here.
    const entry = state().history.find(
      (h) => h.id === historyId && h.key === key && h.environment === environment,
    );
    if (!entry) return { error: 'That history entry does not belong to this flag' };
    if (environment === 'production' && !reason.trim()) {
      return { error: 'Production flag changes require a reason' };
    }

    flag.enabled = entry.enabled;
    flag.rolloutPercentage = entry.rolloutPercentage;
    flag.targeting = structuredClone(entry.targeting) as FlagTargetingRule[];
    flag.lastModifiedAt = new Date();
    flag.lastModifiedBy = actorId;

    recordChange(flag, actorId, reason, 'rollback');

    return structuredClone(flag);
  },
  getHistory(key: string, environment: FlagEnvironment): AdminFlagHistoryEntry[] {
    return state()
      .history
      .filter((h) => h.key === key && h.environment === environment)
      .map((h) => structuredClone(h))
      .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
  },
};

/** Resets mutable mock state between tests. Not part of the public connector contract. */
export function resetMockFeatureFlags(): void {
  (globalThis as StateHost)[STATE_KEY] = {
    flags: initialFlags(),
    history: initialHistory(),
    nextHistoryId: 1,
  };
}
