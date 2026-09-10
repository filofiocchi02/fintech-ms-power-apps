import { redirect } from 'next/navigation';

import { AppShell } from '@/components/internal-tools/AppShell';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';

export default async function RefundsPage() {
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

  return (
    <AppShell activeApp="refunds">
      <PageHeader
        title="Refund Operations"
        description="Request, approve and execute customer refunds. Payment/ledger state stays authoritative in the payments connector."
      />
      <p className="text-muted">Placeholder for refund operations dashboard (#3).</p>
    </AppShell>
  );
}
