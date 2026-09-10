import Link from 'next/link';

import { EnvironmentBadge } from '@/components/internal-tools/EnvironmentBadge';
import type { FlagEnvironment } from '@/lib/integrations/types';

const ENVIRONMENTS: readonly FlagEnvironment[] = ['dev', 'staging', 'production'];

const LABELS: Record<FlagEnvironment, string> = {
  dev: 'Dev',
  staging: 'Staging',
  production: 'Production',
};

interface Props {
  environment: FlagEnvironment;
  query: string;
  selectedKey?: string;
}

/**
 * Explicit environment switch. Each option is a link that puts the environment in the URL,
 * so every read and every subsequent write names the environment the operator can see.
 */
export function EnvironmentSelector({ environment, query, selectedKey }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span id="environment-label" className="text-xs font-semibold uppercase tracking-wide text-muted">
        Environment
      </span>
      <div role="group" aria-labelledby="environment-label" className="flex rounded border border-border-subtle">
        {ENVIRONMENTS.map((env) => {
          const isActive = env === environment;
          const params = new URLSearchParams({ env });
          if (query) params.set('q', query);
          if (selectedKey) params.set('key', selectedKey);

          return (
            <Link
              key={env}
              href={`/flags?${params.toString()}`}
              aria-current={isActive ? 'true' : undefined}
              className={`px-3 py-1.5 text-sm font-medium first:rounded-l last:rounded-r ${
                isActive
                  ? env === 'production'
                    ? 'bg-red-700 text-white'
                    : 'bg-blue-700 text-white'
                  : 'bg-surface text-muted hover:text-foreground'
              }`}
            >
              {LABELS[env]}
            </Link>
          );
        })}
      </div>
      <span className="flex items-center gap-2 text-sm text-muted">
        Acting on
        <EnvironmentBadge environment={environment} />
      </span>
    </div>
  );
}
