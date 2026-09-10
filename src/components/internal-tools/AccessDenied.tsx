import { ROLE_LABELS } from '@/lib/auth/roles';
import type { Actor } from '@/lib/auth/session';

interface Props {
  actor: Actor | null;
  requiredApp?: string;
}

export function AccessDenied({ actor, requiredApp }: Props) {
  const roleLabel = actor ? ROLE_LABELS[actor.role] : 'No role selected';
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="mt-2 text-muted">
          {actor
            ? `${roleLabel} does not have access to ${requiredApp ?? 'this tool'}.`
            : 'Select a role using the switcher in the header.'}
        </p>
      </div>
    </main>
  );
}
