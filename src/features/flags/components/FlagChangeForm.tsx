'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/internal-tools/ConfirmationDialog';
import type { FlagEnvironment } from '@/lib/integrations/types';

interface Props {
  flagKey: string;
  environment: FlagEnvironment;
  enabled: boolean;
  rolloutPercentage: number;
  /** Mirrors the server permission so the operator is told why an action is unavailable. */
  canWrite: boolean;
}

type PendingChange = { enabled: boolean } | { rolloutPercentage: number };

/**
 * Enable/disable and rollout controls.
 *
 * Everything here is a convenience over the API: the change is applied by the server, which
 * re-checks the permission, the production restriction, the typed confirmation and the
 * reason. Disabled buttons and hidden dialogs are never the thing stopping a change.
 */
export function FlagChangeForm({ flagKey, environment, enabled, rolloutPercentage, canWrite }: Props) {
  const router = useRouter();
  const isProduction = environment === 'production';

  const [rollout, setRollout] = useState(String(rolloutPercentage));
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) {
    return (
      <p className="text-sm text-muted">
        {isProduction
          ? 'Production changes are restricted to Manager / Admin. You can review values and history here.'
          : 'Your role can review flags but not change them.'}
      </p>
    );
  }

  function closeDialog() {
    setPending(null);
    setReason('');
    setConfirmation('');
  }

  async function submit() {
    if (!pending) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/flags/${encodeURIComponent(flagKey)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          environment,
          ...pending,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(isProduction ? { confirmation } : {}),
        }),
      });
      const payload = (await response.json()) as
        | { success: true }
        | { success: false; error: { message: string } };

      if (!payload.success) {
        setError(payload.error.message);
        return;
      }

      closeDialog();
      router.refresh();
    } catch {
      setError('The change could not be sent. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const parsedRollout = Number(rollout);
  const rolloutValid =
    Number.isInteger(parsedRollout) && parsedRollout >= 0 && parsedRollout <= 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPending({ enabled: !enabled })}
          disabled={submitting}
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
          onClick={() => setPending({ rolloutPercentage: parsedRollout })}
          disabled={submitting || !rolloutValid || parsedRollout === rolloutPercentage}
          className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          Update rollout
        </button>
        {!rolloutValid && (
          <p className="text-sm text-red-700">Enter a whole number between 0 and 100.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      <ConfirmationDialog
        open={pending !== null}
        title={isProduction ? `Change ${flagKey} in production` : `Change ${flagKey} in ${environment}`}
        description={describeChange(flagKey, environment, pending)}
        confirmLabel={submitting ? 'Applying…' : 'Apply change'}
        destructive={isProduction}
        reasonInput={{
          label: 'Reason',
          value: reason,
          onChange: setReason,
          placeholder: 'Why is this change being made?',
        }}
        confirmationInput={
          isProduction
            ? {
                label: 'Type the flag key to confirm',
                value: confirmation,
                onChange: setConfirmation,
                placeholder: flagKey,
                expectedValue: flagKey,
              }
            : undefined
        }
        onConfirm={submit}
        onCancel={closeDialog}
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
  const target =
    'enabled' in pending
      ? `${pending.enabled ? 'enable' : 'disable'} ${flagKey}`
      : `set ${flagKey} rollout to ${pending.rolloutPercentage}%`;
  return `This will ${target} in ${environment}. The flag system applies the change immediately and records it in its own history.`;
}
