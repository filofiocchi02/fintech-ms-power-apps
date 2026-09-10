import { redirect } from 'next/navigation';

import { AppShell } from '@/components/internal-tools/AppShell';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';

export default async function FlagsPage() {
  const guard = await requireAppAccessOrDenied('flags');
  if (guard.denied) {
    if (guard.reason.actor) {
      redirect('/');
    }
    return <AccessDenied actor={null} requiredApp="Feature Flags" />;
  }

  return (
    <AppShell activeApp="flags">
      <PageHeader
        title="Feature Flag Administration"
        description="View and change feature flags by environment. Flag values and change history are owned by the feature-flag connector."
      />
      <p className="text-muted">Placeholder for feature-flag administration (#4).</p>
    </AppShell>
  );
}
