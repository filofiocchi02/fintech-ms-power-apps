import type {
  FeatureFlag,
  FeatureFlagConnector,
  FeatureFlagHistoryEntry,
  FlagEnvironment,
} from '@/lib/integrations/types';

/**
 * Rollout and targeting extensions to the frozen `FeatureFlagConnector` contract.
 *
 * Issue #4 needs a rollout percentage, a read-only targeting summary and rollout entries in
 * the connector-owned history. `src/lib/integrations/types.ts` is frozen by the foundation
 * issue (#1), so the extension lives here as an adapter contract and the mock implements it.
 * The desired shared change — folding these members into `FeatureFlagConnector` itself — is
 * described in the PR rather than made from this branch.
 */

/** A cohort rule the flag system applies. Display only in this tool. */
export interface FlagTargetingRule {
  cohort: string;
  description: string;
}

export interface AdminFeatureFlag extends FeatureFlag {
  /** Percentage of matching traffic the flag is on for, 0–100. */
  rolloutPercentage: number;
  targeting: readonly FlagTargetingRule[];
}

export type FlagChangeKind = 'enabled' | 'rollout';

export interface AdminFlagHistoryEntry extends FeatureFlagHistoryEntry {
  rolloutPercentage: number;
  changeKind: FlagChangeKind;
}

export interface FlagAdminConnector extends FeatureFlagConnector {
  getFlag(key: string, environment: FlagEnvironment): AdminFeatureFlag | null;
  listFlags(environment: FlagEnvironment): AdminFeatureFlag[];
  setFlag(
    key: string,
    environment: FlagEnvironment,
    enabled: boolean,
    actorId: string,
    reason: string,
  ): AdminFeatureFlag | { error: string };
  setRollout(
    key: string,
    environment: FlagEnvironment,
    rolloutPercentage: number,
    actorId: string,
    reason: string,
  ): AdminFeatureFlag | { error: string };
  getHistory(key: string, environment: FlagEnvironment): AdminFlagHistoryEntry[];
}
