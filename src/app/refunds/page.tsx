import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { AppShell } from '@/components/internal-tools/AppShell';
import { DataTable } from '@/components/internal-tools/DataTable';
import { EmptyState } from '@/components/internal-tools/EmptyState';
import { FilterBar } from '@/components/internal-tools/FilterBar';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { PermissionGate } from '@/components/internal-tools/PermissionGate';
import { StatusBadge } from '@/components/internal-tools/StatusBadge';
import { CaseDecisionActions } from '@/features/refunds/components/CaseDecisionActions';
import { TransactionSearch } from '@/features/refunds/components/TransactionSearch';
import { formatMoney } from '@/features/refunds/money';
import { getRefundService } from '@/features/refunds/server';
import type { RefundCaseSummary, TransactionSummary } from '@/features/refunds/service';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function RefundsPage({ searchParams }: Props) {
  const guard = await requireAppAccessOrDenied('refunds');
  if (guard.denied) {
    // A role that simply cannot open this tool goes back to the console home; only a
    // session with no role selected sees the static denied state.
    if (guard.reason.actor) {
      redirect('/');
    }
    return (
      <AppShell>
        <AccessDenied actor={null} requiredApp="Refunds" />
      </AppShell>
    );
  }

  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const service = getRefundService();
  const transactions = service.searchTransactions(query);
  const cases = service.listCases();
  const pending = cases.filter((row) => row.status === 'PENDING_APPROVAL');

  return (
    <AppShell activeApp="refunds">
      <PageHeader
        title="Refund Operations"
        description="Search authoritative payments, request full or partial refunds, and approve large refunds. Balances, idempotency and refund history stay in the payments system."
      />

      <div className="space-y-6">
        <section aria-labelledby="search-heading" className="space-y-3">
          <h2 id="search-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Transactions
          </h2>
          <FilterBar>
            <TransactionSearch initialQuery={query} />
          </FilterBar>

          {transactions.length === 0 ? (
            <EmptyState
              title="No matching transactions"
              description={
                query
                  ? `Nothing matched "${query}". Search by customer name, email domain, payment reference or customer reference.`
                  : 'No refundable transactions are available.'
              }
            />
          ) : (
            <DataTable<TransactionSummary>
              caption="Payment transactions matching the current search"
              rows={transactions}
              rowKey={(row) => row.paymentRef}
              columns={[
                {
                  header: 'Captured',
                  render: (row) => (
                    <span className="whitespace-nowrap text-muted">
                      {new Date(row.capturedAt).toLocaleDateString('en-GB')}
                    </span>
                  ),
                },
                {
                  header: 'Payment',
                  render: (row) => (
                    <Link
                      href={`/refunds/transactions/${encodeURIComponent(row.paymentRef)}`}
                      className="font-mono text-xs text-blue-700 underline underline-offset-2 hover:text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      {row.paymentRef}
                    </Link>
                  ),
                },
                {
                  header: 'Customer',
                  render: (row) => (
                    <div>
                      <p className="font-medium">{row.customerName}</p>
                      <p className="text-xs text-muted">
                        {row.customerEmailDomain} · {row.customerRef}
                      </p>
                    </div>
                  ),
                },
                {
                  header: 'Amount',
                  align: 'right',
                  render: (row) => (
                    <span className="whitespace-nowrap tabular-nums">
                      {formatMoney(row.amountMinor, row.currency)}
                    </span>
                  ),
                },
                {
                  header: 'Refundable',
                  align: 'right',
                  render: (row) => (
                    <span className="whitespace-nowrap tabular-nums font-medium">
                      {formatMoney(row.refundableMinor, row.currency)}
                    </span>
                  ),
                },
                { header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              ]}
            />
          )}
        </section>

        <section aria-labelledby="pending-heading" className="space-y-3">
          <h2 id="pending-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Awaiting approval
          </h2>
          {pending.length === 0 ? (
            <EmptyState
              title="No refunds awaiting approval"
              description="Refunds over £500.00 are held here until a Manager/Admin approves them."
            />
          ) : (
            <DataTable<RefundCaseSummary>
              caption="Refund requests awaiting Manager/Admin approval"
              rows={pending}
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
                  header: 'Payment',
                  render: (row) => (
                    <Link
                      href={`/refunds/transactions/${encodeURIComponent(row.paymentRef)}`}
                      className="font-mono text-xs text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    >
                      {row.paymentRef}
                    </Link>
                  ),
                },
                { header: 'Customer', render: (row) => row.customerName },
                {
                  header: 'Amount',
                  align: 'right',
                  render: (row) => (
                    <span className="whitespace-nowrap tabular-nums font-medium">
                      {formatMoney(row.amountMinor, row.currency)}
                    </span>
                  ),
                },
                { header: 'Requested by', render: (row) => <span className="text-xs">{row.requestedBy}</span> },
                {
                  header: 'Decision',
                  align: 'right',
                  render: (row) => (
                    <PermissionGate actor={guard.actor} action="refunds:approve">
                      <CaseDecisionActions
                        caseId={row.id}
                        customerName={row.customerName}
                        paymentRef={row.paymentRef}
                        amountMinor={row.amountMinor}
                        currency={row.currency}
                      />
                    </PermissionGate>
                  ),
                },
              ]}
            />
          )}
        </section>

        <section aria-labelledby="cases-heading" className="space-y-3">
          <h2 id="cases-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Refund requests
          </h2>
          {cases.length === 0 ? (
            <EmptyState
              title="No refund requests yet"
              description="Open a transaction to request a full or partial refund."
            />
          ) : (
            <DataTable<RefundCaseSummary>
              caption="App-owned refund requests"
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
                  header: 'Payment',
                  render: (row) => (
                    <Link
                      href={`/refunds/transactions/${encodeURIComponent(row.paymentRef)}`}
                      className="font-mono text-xs text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    >
                      {row.paymentRef}
                    </Link>
                  ),
                },
                { header: 'Customer', render: (row) => row.customerName },
                {
                  header: 'Amount',
                  align: 'right',
                  render: (row) => (
                    <span className="whitespace-nowrap tabular-nums">
                      {formatMoney(row.amountMinor, row.currency)}
                    </span>
                  ),
                },
                { header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                {
                  header: 'Execution',
                  render: (row) => (
                    <span className="font-mono text-xs text-muted">{row.executionRef ?? '—'}</span>
                  ),
                },
              ]}
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}
