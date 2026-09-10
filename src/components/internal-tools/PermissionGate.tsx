import { canPerformAction } from '@/lib/auth/roles';
import type { Actor } from '@/lib/auth/session';

import type { AppAction } from '@/lib/auth/roles';

interface Props {
  actor: Actor;
  action: AppAction;
  children: React.ReactNode;
}

/**
 * Mirrors an action-level server check in the UI. This is a courtesy, not a boundary: every
 * action still enforces the permission server-side.
 */
export function PermissionGate({ actor, action, children }: Props) {
  if (!canPerformAction(actor.role, action)) return null;
  return <>{children}</>;
}
