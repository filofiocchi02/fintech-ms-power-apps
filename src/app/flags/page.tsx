import { redirect } from 'next/navigation';

import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { AppShell } from '@/components/internal-tools/AppShell';
import { ErrorState } from '@/components/internal-tools/ErrorState';
import { FilterBar } from '@/components/internal-tools/FilterBar';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { EnvironmentSelector } from '@/features/flags/components/EnvironmentSelector';
import { FlagDetail } from '@/features/flags/components/FlagDetail';
import { FlagList } from '@/features/flags/components/FlagList';
import { FlagSearch } from '@/features/flags/components/FlagSearch';
import { flagDeps } from '@/features/flags/deps';
import { flagEnvironmentSchema } from '@/features/flags/schemas';
import { getFlagDetail, listFlags } from '@/features/flags/service';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';
import { isAppError } from '@/lib/errors/errors';
import type { FlagEnvironment } from '@/lib/integrations/types';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readParam(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return typeof value === 'string' ? value : '';
}

export default async function FlagsPage({ searchParams }: Props) {
  const guard = await requireAppAccessOrDenied('flags');
  if (guard.denied) {
    // Matches the rest of the console: a role that cannot use this tool goes back to the
    // home page with its role switcher, and only a session with no role sees Access denied.
    // Either way the request renders no flag data.
    if (guard.reason.actor) {
      redirect('/');
    }
    return (
      <AppShell>
        <AccessDenied actor={null} requiredApp="Feature Flags" />
      </AppShell>
    );
  }

  const params = await searchParams;
  const query = readParam(params, 'q');
  const requestedKey = readParam(params, 'key');

  // The environment an operator is acting on is never implied. A URL without a usable one is
  // sent back with dev spelled out, so what is on screen and what is in the address bar agree.
  const parsedEnvironment = flagEnvironmentSchema.safeParse(readParam(params, 'env'));
  if (!parsedEnvironment.success) {
    const target = new URLSearchParams({ env: 'dev' });
    if (query) target.set('q', query);
    if (requestedKey) target.set('key', requestedKey);
    redirect(`/flags?${target.toString()}`);
  }
  const environment: FlagEnvironment = parsedEnvironment.data;

  const deps = flagDeps();
  const list = listFlags(deps, { environment, q: query || undefined });

  if (isAppError(list)) {
    return (
      <AppShell activeApp="flags">
        <PageHeader title="Feature Flag Administration" />
        <ErrorState error={list} title="Flags could not be loaded" />
      </AppShell>
    );
  }

  const selectedKey = list.flags.some((flag) => flag.key === requestedKey)
    ? requestedKey
    : list.flags[0]?.key;
  const detail = selectedKey ? getFlagDetail(deps, selectedKey, environment) : null;

  return (
    <AppShell activeApp="flags">
      <PageHeader
        title="Feature Flag Administration"
        description="View and change feature flags by environment. Flag values and change history are owned by the feature-flag connector."
      />

      <div className="flex flex-col gap-4">
        <FilterBar>
          <EnvironmentSelector
            environment={environment}
            query={query}
            selectedKey={selectedKey}
          />
          <FlagSearch environment={environment} query={query} />
        </FilterBar>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <FlagList
            flags={list.flags}
            environment={environment}
            query={query}
            selectedKey={selectedKey}
          />

          {detail === null ? null : isAppError(detail) ? (
            <ErrorState error={detail} title="Flag could not be loaded" />
          ) : (
            <FlagDetail detail={detail} actor={guard.actor} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
