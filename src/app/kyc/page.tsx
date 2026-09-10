import { redirect } from 'next/navigation';

import { AppShell } from '@/components/internal-tools/AppShell';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';

export default async function KycPage() {
  const guard = await requireAppAccessOrDenied('kyc');
  if (guard.denied) {
    // If the user has selected a role that cannot access this app, send them back to the
    // console home where the role switcher and allowed apps are visible. Only unauthenticated
    // users (no role selected) see the static Access denied state.
    if (guard.reason.actor) {
      redirect('/');
    }
    return <AccessDenied actor={null} requiredApp="KYC" />;
  }

  return (
    <AppShell activeApp="kyc">
      <PageHeader
        title="KYC Review Queue"
        description="Review and decide customer verification cases. Customer identity and provider evidence are read from the authoritative connectors at runtime."
      />
      <p className="text-muted">Placeholder for KYC review queue (#2).</p>
    </AppShell>
  );
}
