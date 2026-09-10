import { AppShell } from '@/components/internal-tools/AppShell';
import { LoadingState } from '@/components/internal-tools/LoadingState';
import { PageHeader } from '@/components/internal-tools/PageHeader';

export default function FlagsLoading() {
  return (
    <AppShell activeApp="flags">
      <PageHeader title="Feature Flag Administration" />
      <LoadingState message="Loading flags from the flag system…" />
    </AppShell>
  );
}
