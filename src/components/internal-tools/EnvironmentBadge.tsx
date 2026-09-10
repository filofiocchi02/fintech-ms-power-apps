import type { FlagEnvironment } from '@/lib/integrations/types';

type Environment = FlagEnvironment | 'production' | 'prod' | 'staging' | 'dev' | 'unknown';

interface Props {
  environment: Environment;
}

const STYLES: Record<string, string> = {
  dev: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  development: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  staging: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  production: 'bg-red-50 text-red-800 ring-red-600/20',
  prod: 'bg-red-50 text-red-800 ring-red-600/20',
  unknown: 'bg-gray-100 text-gray-800 ring-gray-600/20',
};

const LABELS: Record<string, string> = {
  dev: 'dev',
  development: 'dev',
  staging: 'staging',
  production: 'production',
  prod: 'production',
  unknown: 'unknown',
};

export function EnvironmentBadge({ environment }: Props) {
  const key = environment.toLowerCase();
  const style = STYLES[key] ?? STYLES.dev;
  const label = LABELS[key] ?? environment;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${style}`}
    >
      {label}
    </span>
  );
}
