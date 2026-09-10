'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/internal-tools/ConfirmationDialog';
import { ErrorState } from '@/components/internal-tools/ErrorState';

import type { KycDecision } from '../types';

type PendingAction = KycDecision | 'ESCALATE';

interface Props {
  caseId: string;
  /** Version the page was rendered from; a concurrent change invalidates it. */
  version: number;
  decided: boolean;
  /** Mirrors the server's decide permission. The server checks it again. */
  canDecide: boolean;
  /** Mirrors the server's claim/escalate permission (`kyc:assign`). */
  canAssign: boolean;
  /** Mirrors the server's take-over rule: a held case can be pulled by the override tier. */
  canTakeOver: boolean;
  /** Mirrors the server's escalation rule: is there a tier above this actor? */
  canEscalate: boolean;
  assigneeId: string | null;
  actorId: string;
  /** Mirrors the server's sanctions/PEP override rule. */
  approvalBlockedReason: string | null;
}

/**
 * Claim, approve, reject and escalate actions.
 *
 * Everything shown or hidden here is a mirror of a server-side rule, and the server
 * re-checks all of it: this panel cannot grant a mutation, only request one.
 */
export function DecisionPanel({
  caseId,
  version,
  decided,
  canDecide,
  canAssign,
  canTakeOver,
  canEscalate,
  assigneeId,
  actorId,
  approvalBlockedReason,
}: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  if (decided) {
    return <p className="text-sm text-muted">This case has been decided and can no longer be changed.</p>;
  }

  const heldByMe = assigneeId === actorId;
  const heldByOther = assigneeId !== null && !heldByMe;
  const claimable = canAssign && (!heldByOther || canTakeOver);

  async function post(path: string, body: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/kyc/cases/${caseId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setError(payload.error ?? { code: 'INTERNAL', message: 'Action failed' });
        return;
      }
      setReason('');
      router.refresh();
    } catch {
      setError({ code: 'INTERNAL', message: 'Could not reach the server. Try again.' });
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  }

  function confirmLabel(action: PendingAction): string {
    if (action === 'APPROVE') return 'Approve case';
    if (action === 'REJECT') return 'Reject case';
    return 'Confirm escalation';
  }

  return (
    <div className="space-y-3">
      {heldByMe ? (
        <div className="flex flex-wrap gap-3">
          {canDecide && (
            <>
              <button
                type="button"
                disabled={submitting || approvalBlockedReason !== null}
                onClick={() => setPendingAction('APPROVE')}
                className="rounded bg-green-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-900 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setPendingAction('REJECT')}
                className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {canEscalate && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => setPendingAction('ESCALATE')}
              className="rounded border border-border-subtle px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Escalate to manager
            </button>
          )}
          {submitting && <span className="self-center text-sm text-muted">Submitting…</span>}
        </div>
      ) : claimable ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void post('claim', { expectedVersion: version })}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Claim case
            </button>
            {submitting && <span className="text-sm text-muted">Submitting…</span>}
          </div>
          <p className="text-sm text-muted">
            {heldByOther
              ? `Held by ${assigneeId}. Claiming takes the case over and makes you the deciding reviewer.`
              : 'Claim this case to become the deciding reviewer. Only the reviewer who holds a case can decide or escalate it.'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {heldByOther
            ? `Held by ${assigneeId}. Only the reviewer who holds this case can decide or escalate it.`
            : 'Your role can read this case but not act on it.'}
        </p>
      )}

      {heldByMe && approvalBlockedReason && (
        <p className="text-sm text-amber-800" role="status">
          Approval unavailable: {approvalBlockedReason}
        </p>
      )}

      {error && <ErrorState error={error} title="Action rejected" />}

      <ConfirmationDialog
        open={pendingAction !== null}
        title={
          pendingAction === 'APPROVE'
            ? 'Approve this case?'
            : pendingAction === 'REJECT'
              ? 'Reject this case?'
              : 'Escalate this case?'
        }
        description={
          pendingAction === 'APPROVE'
            ? 'The customer will be recorded as approved. This is final and audited.'
            : pendingAction === 'REJECT'
              ? 'The customer will be recorded as rejected. This is final and audited.'
              : 'The case is reassigned to the Manager / Admin tier and you will no longer hold it. This is audited.'
        }
        confirmLabel={pendingAction ? confirmLabel(pendingAction) : 'Confirm'}
        destructive={pendingAction === 'REJECT'}
        reasonInput={{
          label: pendingAction === 'ESCALATE' ? 'Escalation reason' : 'Decision reason',
          value: reason,
          onChange: setReason,
          placeholder:
            pendingAction === 'ESCALATE'
              ? 'Why does this need a manager?'
              : 'Why is this the right decision?',
        }}
        onConfirm={() => {
          if (pendingAction === 'ESCALATE') {
            if (!submitting) void post('escalate', { reason: reason.trim(), expectedVersion: version });
          } else if (pendingAction && !submitting) {
            void post('decision', { decision: pendingAction, reason: reason.trim(), expectedVersion: version });
          }
        }}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
