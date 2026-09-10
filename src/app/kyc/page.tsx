import { redirect } from 'next/navigation';

import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { AppShell } from '@/components/internal-tools/AppShell';
import { EmptyState } from '@/components/internal-tools/EmptyState';
import { ErrorState } from '@/components/internal-tools/ErrorState';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { QueueFilters } from '@/features/kyc/components/QueueFilters';
import { QueueTable } from '@/features/kyc/components/QueueTable';
import { kycDeps } from '@/features/kyc/deps';
import { kycQueueFiltersSchema, queryToFilterInput } from '@/features/kyc/schemas';
import { listQueue } from '@/features/kyc/service';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';
import { isAppError } from '@/lib/errors/errors';
import { parseOrAppError } from '@/lib/validation/zod';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function KycPage({ searchParams }: Props) {
  const guard = await requireAppAccessOrDenied('kyc');
  if (guard.denied) {
    // A role that simply cannot open this app goes back to the console home, where its own
    // apps and the role switcher are visible. Only an unauthenticated visitor sees the
    // static denied state.
    if (guard.reason.actor) {
      redirect('/');
    }
    return (
      <AppShell>
        <AccessDenied actor={null} requiredApp="KYC" />
      </AppShell>
    );
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    // A repeated parameter arrives as an array; take the first, as the API route does, so a
    // hand-edited URL cannot silently render an unfiltered queue.
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') params.set(key, first);
  }

  const filters = parseOrAppError(
    kycQueueFiltersSchema,
    queryToFilterInput(params),
    () => 'Invalid queue filters',
  );

  const deps = kycDeps();
  const allCases = listQueue(deps, guard.actor);
  const filtered = isAppError(filters) ? filters : listQueue(deps, guard.actor, filters);

  return (
    <AppShell activeApp="kyc">
      <PageHeader
        title="KYC review queue"
        description="Customer identity and provider evidence are read from the authoritative connectors at request time; only review workflow state belongs to this tool."
      />

      {!isAppError(allCases) && (
        <QueueFilters
          countries={[...new Set(allCases.map((item) => item.country))].sort()}
          assignees={[...new Set(allCases.map((item) => item.assigneeId).filter((id): id is string => id !== null))].sort()}
        />
      )}

      {isAppError(filtered) ? (
        <ErrorState error={filtered} title="Could not load the queue" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No cases match these filters"
          description="Clear or widen the filters to see more of the queue."
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted" aria-live="polite">
            {filtered.length} of {isAppError(allCases) ? filtered.length : allCases.length} cases
          </p>
          <QueueTable items={filtered} />
        </>
      )}
    </AppShell>
  );
}
