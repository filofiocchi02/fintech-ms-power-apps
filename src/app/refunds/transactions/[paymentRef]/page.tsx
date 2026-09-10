import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { AppShell } from '@/components/internal-tools/AppShell';
import { AuditTimeline } from '@/components/internal-tools/AuditTimeline';
import { DataTable } from '@/components/internal-tools/DataTable';
import { DetailPanel } from '@/components/internal-tools/DetailPanel';
import { KeyValueList } from '@/components/internal-tools/KeyValueList';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { PermissionGate } from '@/components/internal-tools/PermissionGate';
import { StatusBadge } from '@/components/internal-tools/StatusBadge';
import { CaseDecisionActions } from '@/features/refunds/components/CaseDecisionActions';
import { RefundRequestForm } from '@/features/refunds/components/RefundRequestForm';
import { formatMoney } from '@/features/refunds/money';
import { getRefundService } from '@/features/refunds/server';
import type { RefundCaseSummary, RefundHistoryEntry } from '@/features/refunds/service';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';
import { canPerformAction } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ paymentRef: string }>;
}

export default async function TransactionDetailPage({ params }: Props) {
  const guard = await requireAppAccessOrDenied('refunds');
  if (guard.denied) {
    if (guard.reason.actor) {
      redirect('/');
    }
    return (
      <AppShell>
        <AccessDenied actor={null} requiredApp="Refunds" />
      </AppShell>
    );
  }

  const { paymentRef } = await params;
  const result = getRefundService().getTransactionDetail(decodeURIComponent(paymentRef));
  if (!result.ok) notFound();

  const { transaction, paymentRefunds, cases, auditTrail } = result.value;
  const refundable = transaction.refundableMinor > 0 && transaction.status === 'captured';

  return (
    <AppShell activeApp="refunds">
      <PageHeader
        title={`Payment ${transaction.paymentRef}`}
        description={`${transaction.customerName} · captured ${new Date(transaction.capturedAt).toLocaleString('en-GB')}`}
        actions={
          <Link
            href="/refunds"
            className="rounded border border-border-subtle px-3 py-1.5 text-sm font-medium hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Back to search
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailPanel title="Payment (authoritative)">
            <KeyValueList
              items={[
                { label: 'Payment reference', value: <span className="font-mono text-xs">{transaction.paymentRef}</span> },
                { label: 'Status', value: <StatusBadge status={transaction.status} /> },
                { label: 'Captured amount', value: formatMoney(transaction.amountMinor, transaction.currency) },
                {
                  label: 'Remaining refundable',
                  value: (
                    <span className="font-medium">
                      {formatMoney(transaction.refundableMinor, transaction.currency)}
                    </span>
                  ),
                },
                { label: 'Customer', value: `${transaction.customerName} (${transaction.customerRef})` },
                { label: 'Email domain', value: transaction.customerEmailDomain },
              ]}
            />
          </DetailPanel>

          <DetailPanel title="Refund history (payments system)">
            {paymentRefunds.length === 0 ? (
              <p className="text-sm text-muted">No refunds have been executed against this payment.</p>
            ) : (
              <DataTable<RefundHistoryEntry>
                caption="Refunds executed by the payments system"
                rows={paymentRefunds}
                rowKey={(row) => row.refundRef}
                columns={[
                  {
                    header: 'Executed',
                    render: (row) => (
                      <span className="whitespace-nowrap text-muted">
                        {new Date(row.executedAt).toLocaleString('en-GB')}
                      </span>
                    ),
                  },
                  { header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.refundRef}</span> },
                  {
                    header: 'Amount',
                    align: 'right',
                    render: (row) => (
                      <span className="tabular-nums">{formatMoney(row.amountMinor, row.currency)}</span>
                    ),
                  },
                  {
                    header: 'Channel',
                    render: (row) => (
                      <span className="text-xs text-muted">
                        {row.channel === 'internal-tool' ? 'Internal tool' : 'PSP console'}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </DetailPanel>

          <DetailPanel title="Refund requests (this tool)">
            {cases.length === 0 ? (
              <p className="text-sm text-muted">No refund has been requested here for this payment.</p>
            ) : (
              <DataTable<RefundCaseSummary>
                caption="App-owned refund requests for this payment"
                rows={cases}
                rowKey={(row) => row.id}
                columns={[
                  {
                    header: 'Requested',
                    render: (row) => (
                      <span className="whitespace-nowrap text-muted">
                        {new Date(row.requestedAt).toLocaleString('en-GB')}
                      </span>
                    ),
                  },
                  {
                    header: 'Amount',
                    align: 'right',
                    render: (row) => (
                      <span className="tabular-nums">{formatMoney(row.amountMinor, row.currency)}</span>
                    ),
                  },
                  { header: 'Reason', render: (row) => <span className="text-xs">{row.reason}</span> },
                  { header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                  {
                    header: 'Decision',
                    align: 'right',
                    render: (row) =>
                      row.status === 'PENDING_APPROVAL' ? (
                        <PermissionGate actor={guard.actor} action="refunds:approve">
                          <CaseDecisionActions
                            caseId={row.id}
                            customerName={row.customerName}
                            paymentRef={row.paymentRef}
                            amountMinor={row.amountMinor}
                            currency={row.currency}
                          />
                        </PermissionGate>
                      ) : (
                        <span className="font-mono text-xs text-muted">{row.executionRef ?? '—'}</span>
                      ),
                  },
                ]}
              />
            )}
          </DetailPanel>
        </div>

        <div className="space-y-6">
          <DetailPanel title="Request a refund">
            <PermissionGate actor={guard.actor} action="refunds:request">
              {refundable ? (
                <RefundRequestForm
                  paymentRef={transaction.paymentRef}
                  customerName={transaction.customerName}
                  currency={transaction.currency}
                  refundableMinor={transaction.refundableMinor}
                />
              ) : (
                <p className="text-sm text-muted">
                  This payment has no refundable balance remaining.
                </p>
              )}
            </PermissionGate>
            {!canPerformAction(guard.actor.role, 'refunds:request') && (
              <p className="text-sm text-muted">
                Your role can view refunds but cannot request them.
              </p>
            )}
          </DetailPanel>

          <DetailPanel title="Internal-tool audit">
            <p className="mb-3 text-xs text-muted">
              What operators did in this tool. Financial history stays in the payments system, above.
            </p>
            <AuditTimeline events={auditTrail} />
          </DetailPanel>
        </div>
      </div>
    </AppShell>
  );
}
