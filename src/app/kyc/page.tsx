import { AppShell } from '@/components/internal-tools/AppShell';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';

export default async function KycPage() {
  const guard = await requireAppAccessOrDenied('kyc');
  if (guard.denied) {
    return <AccessDenied actor={guard.reason.actor} requiredApp="KYC" />;
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
