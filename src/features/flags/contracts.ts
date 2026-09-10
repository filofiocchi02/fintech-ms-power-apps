import type {
  FeatureFlag,
  FeatureFlagConnector,
  FeatureFlagHistoryEntry,
  FlagEnvironment,
} from '@/lib/integrations/types';

/**
 * Rollout and targeting extensions to the frozen `FeatureFlagConnector` contract.
 *
 * Issue #4 needs a rollout percentage, editable targeting, rollback to an earlier state, and
 * the matching entries in the connector-owned history. `src/lib/integrations/types.ts` is
 * frozen by the foundation issue (#1), so the extension lives here as an adapter contract and
 * the mock implements it. The desired shared change — folding these members into
 * `FeatureFlagConnector` itself — is described in the PR rather than made from this branch.
 */

/** A cohort rule the flag system applies to decide who sees the flag. */
export interface FlagTargetingRule {
  cohort: string;
  description: string;
}

export interface AdminFeatureFlag extends FeatureFlag {
  /** Percentage of matching traffic the flag is on for, 0–100. */
  rolloutPercentage: number;
  targeting: readonly FlagTargetingRule[];
}

export type FlagChangeKind = 'enabled' | 'rollout' | 'targeting' | 'rollback';

/**
 * A history entry is a full state snapshot, not a delta, so restoring one is unambiguous
 * even when several dimensions have moved since.
 */
export interface AdminFlagHistoryEntry extends FeatureFlagHistoryEntry {
  id: string;
  rolloutPercentage: number;
  targeting: readonly FlagTargetingRule[];
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
  setTargeting(
    key: string,
    environment: FlagEnvironment,
    targeting: readonly FlagTargetingRule[],
    actorId: string,
    reason: string,
  ): AdminFeatureFlag | { error: string };
  /**
   * Restores the state recorded by an earlier history entry. History is append-only: the
   * restore is itself recorded, so the record of what happened is never rewritten.
   */
  rollbackTo(
    key: string,
    environment: FlagEnvironment,
    historyId: string,
    actorId: string,
    reason: string,
  ): AdminFeatureFlag | { error: string };
  getHistory(key: string, environment: FlagEnvironment): AdminFlagHistoryEntry[];
}
