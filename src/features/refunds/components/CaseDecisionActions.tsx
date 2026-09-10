'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/internal-tools/ConfirmationDialog';

import { formatMoney } from '../money';

interface Props {
  caseId: string;
  customerName: string;
  paymentRef: string;
  amountMinor: number;
  currency: string;
}

type Decision = 'approve' | 'reject';

/**
 * Manager/Admin decision controls for a pending refund.
 *
 * Approving is the only action in the app that sends a large refund to the payments system,
 * so it asks for explicit confirmation of amount, currency and customer, and the button
 * stays disabled until the request settles. The server re-checks `refunds:approve`.
 */
export function CaseDecisionActions({ caseId, customerName, paymentRef, amountMinor, currency }: Props) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(kind: Decision) {
    if (submitting) return;
    // The shared dialog has no pending state, so close it as the request starts and leave the
    // disabled Approve/Reject buttons as the only controls.
    setDecision(null);
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/refunds/cases/${encodeURIComponent(caseId)}/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decisionReason: reason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        setError(payload.error?.message ?? 'The decision could not be recorded');
        return;
      }
      setReason('');
      router.refresh();
    } catch {
      setError('Could not reach the refunds service');
    } finally {
      setSubmitting(false);
      setDecision(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => setDecision('approve')}
          className="rounded bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setDecision('reject')}
          className="rounded border border-border-subtle px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}

      <ConfirmationDialog
        open={decision !== null}
        title={decision === 'reject' ? 'Reject refund request' : 'Approve and execute refund'}
        description={
          decision === 'reject'
            ? `Reject the ${formatMoney(amountMinor, currency)} refund for ${customerName} (${paymentRef}). No money moves.`
            : `Execute ${formatMoney(amountMinor, currency)} to ${customerName} against ${paymentRef}. This moves money immediately and cannot be undone here.`
        }
        confirmLabel={decision === 'reject' ? 'Reject request' : 'Approve and refund'}
        destructive={decision === 'approve'}
        reasonInput={
          decision === 'reject'
            ? { label: 'Rejection reason', value: reason, onChange: setReason }
            : { label: 'Approval note', value: reason, onChange: setReason }
        }
        onConfirm={() => decision && send(decision)}
        onCancel={() => setDecision(null)}
      />
    </div>
  );
}
