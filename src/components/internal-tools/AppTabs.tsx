import Link from 'next/link';

import { type App } from '@/lib/auth/roles';

interface Props {
  apps: App[];
  activeApp?: App | null;
}

const APP_LABELS: Record<App, string> = {
  kyc: 'KYC',
  refunds: 'Refunds',
  flags: 'Feature Flags',
  platform: 'Platform',
};

export function AppTabs({ apps, activeApp }: Props) {
  return (
    <nav aria-label="Applications" className="border-b border-border-subtle">
      <ul className="flex gap-1 overflow-x-auto px-4">
        {apps.map((app) => {
          const isActive = app === activeApp;
          return (
            <li key={app}>
              <Link
                href={`/${app === 'platform' ? '' : app}`}
                className={`block whitespace-nowrap px-4 py-2.5 text-sm font-medium ${
                  isActive
                    ? 'border-b-2 border-blue-700 text-blue-700'
                    : 'text-muted hover:text-foreground'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {APP_LABELS[app]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
