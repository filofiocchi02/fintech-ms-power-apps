'use client';

import type { FlagEnvironment } from '@/lib/integrations/types';

import type { AdminFlagHistoryEntry } from '../contracts';
import { FlagChangeDialog } from './FlagChangeDialog';
import { useFlagChange } from './useFlagChange';

interface Props {
  flagKey: string;
  environment: FlagEnvironment;
  history: readonly AdminFlagHistoryEntry[];
  canWrite: boolean;
}

/**
 * The flag system's own history, with a rollback next to each entry.
 *
 * A rollback restores the state that entry recorded and is itself recorded as a new entry:
 * history is a record of what happened, so nothing here rewrites it.
 */
export function FlagHistory({ flagKey, environment, history, canWrite }: Props) {
  const change = useFlagChange(flagKey, environment);
  const pending = change.pending;
  const restoring =
    pending && 'rollbackTo' in pending
      ? (history.find((entry) => entry.id === pending.rollbackTo) ?? null)
      : null;

  if (history.length === 0) {
    return <p className="text-sm text-muted">The flag system has recorded no changes here yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3 text-sm">
        {history.map((entry, index) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle pb-2 last:border-0"
          >
            <div>
              <p className="text-xs text-muted">{entry.changedAt.toLocaleString('en-GB')}</p>
              <p className="font-medium text-foreground">
                {describeEntry(entry)} by {entry.actorId}
              </p>
              <p className="text-xs text-muted">
                {entry.enabled ? 'Enabled' : 'Disabled'}, {entry.rolloutPercentage}%,{' '}
                {entry.targeting.length === 0
                  ? 'no cohorts'
                  : entry.targeting.map((rule) => rule.cohort).join(', ')}
              </p>
              {entry.reason && <p className="text-xs text-muted">{entry.reason}</p>}
            </div>
            {canWrite && index > 0 && (
              <button
                type="button"
                onClick={() => change.request({ rollbackTo: entry.id })}
                disabled={change.submitting}
                className="rounded border border-border-subtle px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
              >
                Roll back to this
              </button>
            )}
          </li>
        ))}
      </ol>

      {change.error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {change.error}
        </p>
      )}

      <FlagChangeDialog
        flagKey={flagKey}
        environment={environment}
        description={
          restoring
            ? `This will restore ${flagKey} in ${environment} to the state recorded on ${restoring.changedAt.toLocaleString('en-GB')}: ${
                restoring.enabled ? 'enabled' : 'disabled'
              }, ${restoring.rolloutPercentage}% rollout, ${
                restoring.targeting.length === 0
                  ? 'no cohorts'
                  : `cohorts ${restoring.targeting.map((rule) => rule.cohort).join(', ')}`
              }. The rollback is recorded as a new entry in the flag system's history.`
            : ''
        }
        change={change}
      />
    </div>
  );
}

function describeEntry(entry: AdminFlagHistoryEntry): string {
  switch (entry.changeKind) {
    case 'enabled':
      return entry.enabled ? 'Enabled' : 'Disabled';
    case 'rollout':
      return `Rollout ${entry.rolloutPercentage}%`;
    case 'targeting':
      return 'Targeting changed';
    case 'rollback':
      return 'Rolled back';
  }
}
