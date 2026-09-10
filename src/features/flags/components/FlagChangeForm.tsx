'use client';

import { useState } from 'react';

import type { FlagEnvironment } from '@/lib/integrations/types';

import type { FlagTargetingRule } from '../contracts';
import { FlagChangeDialog } from './FlagChangeDialog';
import { TargetingEditor } from './TargetingEditor';
import { useFlagChange, type PendingChange } from './useFlagChange';

interface Props {
  flagKey: string;
  environment: FlagEnvironment;
  enabled: boolean;
  rolloutPercentage: number;
  targeting: readonly FlagTargetingRule[];
  /** Mirrors the server permission so the operator is told why an action is unavailable. */
  canWrite: boolean;
}

/**
 * Enable/disable, rollout and targeting controls.
 *
 * Everything here is a convenience over the API: the change is applied by the server, which
 * re-checks the permission, the production restriction, the typed confirmation and the
 * reason. Disabled buttons and hidden dialogs are never the thing stopping a change.
 */
export function FlagChangeForm({
  flagKey,
  environment,
  enabled,
  rolloutPercentage,
  targeting,
  canWrite,
}: Props) {
  const isProduction = environment === 'production';
  const change = useFlagChange(flagKey, environment);
  const [rollout, setRollout] = useState(String(rolloutPercentage));

  if (!canWrite) {
    return (
      <p className="text-sm text-muted">
        {isProduction
          ? 'Production changes are restricted to Manager / Admin. You can review values and history here.'
          : 'Your role can review flags but not change them.'}
      </p>
    );
  }

  // An empty field is not zero: it is nothing, and nothing cannot be applied.
  const parsedRollout = rollout.trim() === '' ? Number.NaN : Number(rollout);
  const rolloutValid =
    Number.isInteger(parsedRollout) && parsedRollout >= 0 && parsedRollout <= 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => change.request({ enabled: !enabled })}
          disabled={change.submitting}
          className={`rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
            enabled ? 'bg-red-700 hover:bg-red-800' : 'bg-green-700 hover:bg-green-800'
          }`}
        >
          {enabled ? 'Disable flag' : 'Enable flag'}
        </button>
        <span className="text-sm text-muted">
          Currently {enabled ? 'enabled' : 'disabled'} in {environment}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="rollout" className="text-xs font-medium uppercase tracking-wide text-muted">
            Rollout percentage
          </label>
          <input
            id="rollout"
            name="rollout"
            type="number"
            min={0}
            max={100}
            step={1}
            value={rollout}
            onChange={(event) => setRollout(event.target.value)}
            className="w-28 rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground focus:border-blue-600 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => change.request({ rolloutPercentage: parsedRollout })}
          disabled={change.submitting || !rolloutValid || parsedRollout === rolloutPercentage}
          className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          Update rollout
        </button>
        {!rolloutValid && (
          <p className="text-sm text-red-700">Enter a whole number between 0 and 100.</p>
        )}
      </div>

      <TargetingEditor
        targeting={targeting}
        submitting={change.submitting}
        onApply={(rules) => change.request({ targeting: rules })}
      />

      {change.error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {change.error}
        </p>
      )}

      <FlagChangeDialog
        flagKey={flagKey}
        environment={environment}
        description={describeChange(flagKey, environment, change.pending)}
        change={change}
      />
    </div>
  );
}

function describeChange(
  flagKey: string,
  environment: FlagEnvironment,
  pending: PendingChange | null,
): string {
  if (!pending) return '';
  let target: string;
  if ('enabled' in pending) {
    target = `${pending.enabled ? 'enable' : 'disable'} ${flagKey}`;
  } else if ('rolloutPercentage' in pending) {
    target = `set ${flagKey} rollout to ${pending.rolloutPercentage}%`;
  } else if ('targeting' in pending) {
    target =
      pending.targeting.length === 0
        ? `remove every targeting rule from ${flagKey}, leaving it to apply to all traffic within the rollout percentage`
        : `set ${flagKey} targeting to ${pending.targeting.map((rule) => rule.cohort).join(', ')}`;
  } else {
    target = `restore ${flagKey} to an earlier recorded state`;
  }
  return `This will ${target} in ${environment}. The flag system applies the change immediately and records it in its own history.`;
}
