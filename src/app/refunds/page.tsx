import { AppShell } from '@/components/internal-tools/AppShell';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';

export default async function RefundsPage() {
  const guard = await requireAppAccessOrDenied('refunds');
  if (guard.denied) {
    return <AccessDenied actor={guard.reason.actor} requiredApp="Refunds" />;
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
