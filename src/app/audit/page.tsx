import { redirect } from 'next/navigation';

import { AppShell } from '@/components/internal-tools/AppShell';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';

export default async function AuditPage() {
  const guard = await requireAppAccessOrDenied('audit');
  if (guard.denied) {
    if (guard.reason.actor) {
      redirect('/');
    }
    return <AccessDenied actor={null} requiredApp="Audit" />;
  }

  return (
    <AppShell activeApp="audit">
      <PageHeader
        title="Internal Tool Audit"
        description="Activity recorded inside the internal tools console. Domain history remains in the authoritative connectors."
      />
      <p className="text-muted">Placeholder for cross-tool audit timeline (#5).</p>
    </AppShell>
  );
}
