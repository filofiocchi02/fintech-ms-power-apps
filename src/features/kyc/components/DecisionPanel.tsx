'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/internal-tools/ConfirmationDialog';
import { ErrorState } from '@/components/internal-tools/ErrorState';

import type { KycDecision } from '../types';

interface Props {
  caseId: string;
  /** Version the page was rendered from; a concurrent decision invalidates it. */
  version: number;
  decided: boolean;
  /** Mirrors the server's decide permission. The server checks it again. */
  canDecide: boolean;
  /** Mirrors the server's sanctions/PEP override rule. */
  approvalBlockedReason: string | null;
}

/**
 * Approve / reject actions.
 *
 * Everything shown or hidden here is a mirror of a server-side rule, and the server
 * re-checks all of it: this panel cannot grant a decision, only request one.
 */
export function DecisionPanel({ caseId, version, decided, canDecide, approvalBlockedReason }: Props) {
  const router = useRouter();
  const [pendingDecision, setPendingDecision] = useState<KycDecision | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  if (decided) {
    return <p className="text-sm text-muted">This case has been decided and can no longer be changed.</p>;
  }

  if (!canDecide) {
    return (
      <p className="text-sm text-muted">
        Your role can read this case but not decide it.
      </p>
    );
  }

  async function submit(decision: KycDecision) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/kyc/cases/${caseId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reason.trim(), expectedVersion: version }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setError(payload.error ?? { code: 'INTERNAL', message: 'Decision failed' });
        return;
      }
      setReason('');
      router.refresh();
    } catch {
      setError({ code: 'INTERNAL', message: 'Could not reach the server. Try again.' });
    } finally {
      setSubmitting(false);
      setPendingDecision(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={submitting || approvalBlockedReason !== null}
          onClick={() => setPendingDecision('APPROVE')}
          className="rounded bg-green-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-900 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setPendingDecision('REJECT')}
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          Reject
        </button>
        {submitting && <span className="self-center text-sm text-muted">Submitting…</span>}
      </div>

      {approvalBlockedReason && (
        <p className="text-sm text-amber-800" role="status">
          Approval unavailable: {approvalBlockedReason}
        </p>
      )}

      {error && <ErrorState error={error} title="Decision rejected" />}

      <ConfirmationDialog
        open={pendingDecision !== null}
        title={pendingDecision === 'APPROVE' ? 'Approve this case?' : 'Reject this case?'}
        description={
          pendingDecision === 'APPROVE'
            ? 'The customer will be recorded as approved. This is final and audited.'
            : 'The customer will be recorded as rejected. This is final and audited.'
        }
        confirmLabel={pendingDecision === 'APPROVE' ? 'Approve case' : 'Reject case'}
        destructive={pendingDecision === 'REJECT'}
        reasonInput={{
          label: 'Decision reason',
          value: reason,
          onChange: setReason,
          placeholder: 'Why is this the right decision?',
        }}
        onConfirm={() => {
          if (pendingDecision && !submitting) void submit(pendingDecision);
        }}
        onCancel={() => setPendingDecision(null)}
      />
    </div>
  );
}
