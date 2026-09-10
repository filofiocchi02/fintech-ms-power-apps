'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { FlagEnvironment } from '@/lib/integrations/types';

import type { FlagTargetingRule } from '../contracts';

/** One request changes one thing, matching what the API accepts. */
export type PendingChange =
  | { enabled: boolean }
  | { rolloutPercentage: number }
  | { targeting: FlagTargetingRule[] }
  | { rollbackTo: string };

/**
 * Shared client behaviour for every flag change: a confirmation step, the reason and typed
 * confirmation a production write needs, and the single PATCH that applies it.
 *
 * The server re-checks all of it. Nothing here is a permission boundary; it exists so the
 * operator is asked before a change, and told plainly when the server refuses one.
 */
export function useFlagChange(flagKey: string, environment: FlagEnvironment) {
  const router = useRouter();

  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setPending(null);
    setReason('');
    setConfirmation('');
  }

  async function submit() {
    if (!pending || submitting) return;
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
          ...(environment === 'production' ? { confirmation } : {}),
        }),
      });
      const payload = (await response.json()) as
        | { success: true }
        | { success: false; error: { message: string } };

      // The dialog closes either way: the message belongs on the page behind it, and a
      // dialog left open after a rejected change is easy to submit again by accident.
      close();

      // Refreshed either way: a rejected change leaves the server state unchanged, and a
      // change the flag system applied but could not audit has to be shown as it now is.
      router.refresh();

      if (!payload.success) {
        setError(payload.error.message);
      }
    } catch {
      close();
      setError('The change could not be sent. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return {
    pending,
    request: setPending,
    reason,
    setReason,
    confirmation,
    setConfirmation,
    submitting,
    error,
    submit,
    close,
  };
}
