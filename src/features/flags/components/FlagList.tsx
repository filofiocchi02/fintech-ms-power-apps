import Link from 'next/link';

import { DataTable } from '@/components/internal-tools/DataTable';
import { EmptyState } from '@/components/internal-tools/EmptyState';
import type { FlagEnvironment } from '@/lib/integrations/types';

import type { AdminFeatureFlag } from '../contracts';
import { FlagStateBadge } from './FlagStateBadge';

interface Props {
  flags: AdminFeatureFlag[];
  environment: FlagEnvironment;
  query: string;
  selectedKey?: string;
}

export function FlagList({ flags, environment, query, selectedKey }: Props) {
  if (flags.length === 0) {
    return (
      <EmptyState
        title="No flags match this search"
        description={`Nothing in ${environment} matches “${query}”. Clear the search to see every flag in this environment.`}
      />
    );
  }

  return (
    <DataTable
      caption={`Feature flags in ${environment}`}
      rows={flags}
      rowKey={(flag) => flag.key}
      columns={[
        {
          header: 'Flag',
          render: (flag) => {
            const params = new URLSearchParams({ env: environment, key: flag.key });
            if (query) params.set('q', query);
            return (
              <Link
                href={`/flags?${params.toString()}`}
                className={`font-medium ${flag.key === selectedKey ? 'text-blue-700 underline' : 'text-foreground hover:underline'}`}
                aria-current={flag.key === selectedKey ? 'true' : undefined}
              >
                {flag.key}
              </Link>
            );
          },
        },
        {
          header: 'State',
          render: (flag) => <FlagStateBadge enabled={flag.enabled} />,
        },
        {
          header: 'Rollout',
          align: 'right',
          render: (flag) => <span className="tabular-nums">{flag.rolloutPercentage}%</span>,
        },
        {
          header: 'Description',
          render: (flag) => <span className="text-muted">{flag.description}</span>,
        },
      ]}
    />
  );
}
