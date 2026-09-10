import { getCurrentUser } from '@/lib/auth/session';

import { AppTabs } from './AppTabs';
import { EnvironmentBadge } from './EnvironmentBadge';
import { RoleSwitcher } from './RoleSwitcher';
import type { App } from '@/lib/auth/roles';
import { appsForRole } from '@/lib/auth/roles';

type DeploymentEnvironment = 'dev' | 'staging' | 'production' | 'unknown';

function currentEnvironment(): DeploymentEnvironment {
  const env = process.env.INTERNAL_TOOLS_ENV;
  if (env && ['dev', 'staging', 'production'].includes(env)) {
    return env as DeploymentEnvironment;
  }
  // Fail closed: a production build without an explicit environment label is marked unknown
  // so operators are not misled into thinking they are on production.
  if (process.env.NODE_ENV === 'production') {
    return 'unknown';
  }
  return 'dev';
}

interface Props {
  children: React.ReactNode;
  activeApp?: App | null;
}

export async function AppShell({ children, activeApp }: Props) {
  const user = await getCurrentUser();
  const apps = user ? appsForRole(user.role) : [];

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border-subtle bg-surface">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold tracking-tight">Internal Tools</span>
            <EnvironmentBadge environment={currentEnvironment()} />
          </div>
          <div className="flex items-center gap-4">
            <RoleSwitcher currentUserId={user?.id ?? null} />
          </div>
        </div>
        {user && <AppTabs apps={apps} activeApp={activeApp} />}
      </header>
      <div className="flex-1 bg-background px-4 py-6">{children}</div>
    </div>
  );
}
