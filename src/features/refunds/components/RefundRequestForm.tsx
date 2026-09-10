'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/internal-tools/ConfirmationDialog';
import { ErrorState } from '@/components/internal-tools/ErrorState';

import { formatMoney, parseAmountToMinor } from '../money';
import { LARGE_REFUND_THRESHOLD_MINOR } from '../policy';

interface Props {
  paymentRef: string;
  customerName: string;
  currency: string;
  refundableMinor: number;
}

function freshKey(paymentRef: string): string {
  return `${paymentRef}-${crypto.randomUUID()}`;
}

/**
 * Refund request form: the one interactive leaf that can move money.
 *
 * It confirms the exact amount, currency and customer before submitting, disables itself
 * while in flight, and carries an idempotency key so a double submit cannot issue two
 * refunds. Every rule it shows — balance, threshold, permission — is enforced again on the
 * server; this is operator guidance, not enforcement.
 */
export function RefundRequestForm({ paymentRef, customerName, currency, refundableMinor }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => freshKey(paymentRef));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const amountMinor = parseAmountToMinor(amount);
  const amountValid = amountMinor !== null && amountMinor > 0 && amountMinor <= refundableMinor;
  const reasonValid = reason.trim().length > 0;
  const needsApproval = amountMinor !== null && amountMinor > LARGE_REFUND_THRESHOLD_MINOR;
  const canSubmit = amountValid && reasonValid && !submitting;

  async function submit() {
    if (amountMinor === null || submitting) return;
    // The shared dialog has no pending state, so close it as the request starts: the only
    // control left on screen is the form's own disabled "Submitting…" button.
    setConfirming(false);
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/refunds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          paymentRef,
          amountMinor,
          reason: reason.trim(),
          idempotencyKey,
          confirmed: true,
        }),
      });
      const payload = await response.json();

      if (!response.ok || payload.success === false) {
        setError(payload.error ?? { code: 'INTERNAL', message: 'Refund request failed' });
        return;
      }

      const refundCase = payload.data.case;
      setNotice(
        refundCase.status === 'PENDING_APPROVAL'
          ? `Sent for approval: ${formatMoney(refundCase.amountMinor, refundCase.currency)} for ${customerName}.`
          : `Refund executed: ${formatMoney(refundCase.amountMinor, refundCase.currency)} (${refundCase.executionRef}).`,
      );
      setAmount('');
      setReason('');
      setIdempotencyKey(freshKey(paymentRef));
      router.refresh();
    } catch {
      setError({ code: 'NETWORK', message: 'Could not reach the refunds service' });
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) setConfirming(true);
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="refund-amount" className="block text-xs font-medium uppercase tracking-wide text-muted">
              Amount ({currency})
            </label>
            <input
              id="refund-amount"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              aria-describedby="refund-amount-help"
              className="mt-1 w-full rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <p id="refund-amount-help" className="mt-1 text-xs text-muted">
              Refundable balance {formatMoney(refundableMinor, currency)}. Partial refunds allowed.
            </p>
            {amount && amountMinor === null && (
              <p className="mt-1 text-xs text-red-700">Enter an amount with at most two decimals.</p>
            )}
            {amountMinor !== null && amountMinor > refundableMinor && (
              <p className="mt-1 text-xs text-red-700">
                Exceeds the remaining refundable balance of {formatMoney(refundableMinor, currency)}.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="refund-key" className="block text-xs font-medium uppercase tracking-wide text-muted">
              Idempotency key
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="refund-key"
                name="idempotencyKey"
                value={idempotencyKey}
                onChange={(event) => setIdempotencyKey(event.target.value)}
                className="w-full rounded border border-border-subtle bg-surface px-3 py-1.5 font-mono text-xs focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              />
              <button
                type="button"
                onClick={() => setIdempotencyKey(freshKey(paymentRef))}
                className="whitespace-nowrap rounded border border-border-subtle px-2 py-1.5 text-xs font-medium hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                New key
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Re-submitting the same key returns the original refund instead of issuing a second one.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="refund-reason" className="block text-xs font-medium uppercase tracking-wide text-muted">
            Reason
          </label>
          <textarea
            id="refund-reason"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        </div>

        {needsApproval && (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Over {formatMoney(LARGE_REFUND_THRESHOLD_MINOR, 'GBP')}: this request will be held for
            Manager/Admin approval and no money moves until it is approved.
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Review refund'}
        </button>
      </form>

      {notice && (
        <p role="status" className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          {notice}
        </p>
      )}
      {error && <ErrorState error={error} title="Refund not processed" />}

      <ConfirmationDialog
        open={confirming}
        title={needsApproval ? 'Send refund for approval' : 'Confirm refund'}
        description={
          amountMinor === null
            ? ''
            : `${needsApproval ? 'Request' : 'Refund'} ${formatMoney(amountMinor, currency)} to ${customerName} against ${paymentRef}.${
                needsApproval ? ' A Manager/Admin must approve before any money moves.' : ' This moves money immediately.'
              }`
        }
        confirmLabel={needsApproval ? 'Send for approval' : 'Refund now'}
        destructive={!needsApproval}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
