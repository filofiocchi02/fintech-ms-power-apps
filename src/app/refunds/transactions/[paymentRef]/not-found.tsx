import Link from 'next/link';

import { EmptyState } from '@/components/internal-tools/EmptyState';

export default function TransactionNotFound() {
  return (
    <EmptyState
      title="Transaction not found"
      description="The payments system has no transaction with that reference."
      action={
        <Link
          href="/refunds"
          className="rounded border border-border-subtle px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          Back to search
        </Link>
      }
    />
  );
}
