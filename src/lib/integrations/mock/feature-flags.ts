import 'server-only';

import type {
  FeatureFlag,
  FeatureFlagConnector,
  FeatureFlagHistoryEntry,
  FlagEnvironment,
} from '../types';

const EPOCH = Date.parse('2026-01-05T09:00:00.000Z');

const flagKeys = ['new-dashboard', 'risk-scoring-v2', 'instant-payouts', 'kyc-auto-approve'];

function initialFlags(): FeatureFlag[] {
  return [
    {
      key: 'new-dashboard',
      environment: 'dev',
      enabled: true,
      description: 'React 19 operations console shell',
      lastModifiedAt: new Date(EPOCH - 10 * 24 * 60 * 60 * 1000),
      lastModifiedBy: 'demo_release_engineer',
    },
    {
      key: 'risk-scoring-v2',
      environment: 'dev',
      enabled: true,
      description: 'Updated risk model for KYC and refunds',
      lastModifiedAt: new Date(EPOCH - 5 * 24 * 60 * 60 * 1000),
      lastModifiedBy: 'demo_release_engineer',
    },
    {
      key: 'instant-payouts',
      environment: 'staging',
      enabled: false,
      description: 'Immediate refund execution path',
      lastModifiedAt: new Date(EPOCH - 2 * 24 * 60 * 60 * 1000),
      lastModifiedBy: 'demo_release_engineer',
    },
    {
      key: 'kyc-auto-approve',
      environment: 'production',
      enabled: false,
      description: 'Auto-approve low-risk KYC cases',
      lastModifiedAt: new Date(EPOCH - 1 * 24 * 60 * 60 * 1000),
      lastModifiedBy: 'demo_manager_admin',
    },
  ];
}

let flags: FeatureFlag[] = initialFlags();
const history: FeatureFlagHistoryEntry[] = [];

function getFlag(key: string, environment: FlagEnvironment): FeatureFlag | null {
  return flags.find((f) => f.key === key && f.environment === environment) ?? null;
}

export const featureFlagConnector: FeatureFlagConnector = {
  getFlag,
  listFlags(environment: FlagEnvironment): FeatureFlag[] {
    return flagKeys
      .map((key) => getFlag(key, environment))
      .filter((f): f is FeatureFlag => f !== null);
  },
  setFlag(
    key: string,
    environment: FlagEnvironment,
    enabled: boolean,
    actorId: string,
    reason: string,
  ): FeatureFlag | { error: string } {
    const flag = getFlag(key, environment);
    if (!flag) return { error: `Flag ${key} does not exist in ${environment}` };
    if (environment === 'production' && !reason.trim()) {
      return { error: 'Production flag changes require a reason' };
    }

    flag.enabled = enabled;
    flag.lastModifiedAt = new Date();
    flag.lastModifiedBy = actorId;

    history.push({
      key,
      environment,
      actorId,
      enabled,
      reason,
      changedAt: new Date(),
    });

    return flag;
  },
  getHistory(key: string, environment: FlagEnvironment): FeatureFlagHistoryEntry[] {
    return history.filter((h) => h.key === key && h.environment === environment);
  },
};

/** Resets mutable mock state between tests. Not part of the public connector contract. */
export function resetMockFeatureFlags(): void {
  flags = initialFlags();
  history.length = 0;
}
