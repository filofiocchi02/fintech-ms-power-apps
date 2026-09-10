'use client';

import { useEffect, useRef, useState } from 'react';

import { ROLE_LABELS } from '@/lib/auth/roles';
import { DEMO_USERS, getDemoUser } from '@/lib/auth/users';

interface Props {
  currentUserId: string | null;
}

/**
 * Demo user picker. Each entry shows the person's name with their role underneath, and the
 * selected state keeps both visible — matching how the console actually identifies an
 * operator: a user who happens to hold a role, not a bare role.
 */
export function RoleSwitcher({ currentUserId }: Props) {
  const current = currentUserId ? getDemoUser(currentUserId) : null;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function select(userId: string) {
    if (pending || userId === currentUserId) {
      setOpen(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/demo/role', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }

      const body = (await res.json().catch(() => ({ success: false }))) as {
        success?: boolean;
        error?: { message?: string };
      };
      setError(body.error?.message ?? 'User switch failed. Please try again.');
      setOpen(false);
    } catch {
      setError('Network error. Please try again.');
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <button
        type="button"
        aria-label="Act as user"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        aria-describedby={error ? 'user-switcher-error' : undefined}
        className="rounded border border-border-subtle bg-surface px-2 py-1 text-left text-sm text-foreground focus:border-blue-600 focus:outline-none disabled:opacity-50"
      >
        {current ? (
          <>
            <span className="block font-medium leading-tight">{current.name}</span>
            <span className="block text-xs leading-tight text-muted">
              {ROLE_LABELS[current.role]}
            </span>
          </>
        ) : (
          'Select user…'
        )}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose user"
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded border border-border-subtle bg-surface py-1 shadow-lg"
        >
          {DEMO_USERS.map((user) => (
            <li key={user.id} role="option" aria-selected={user.id === currentUserId}>
              <button
                type="button"
                disabled={pending}
                onClick={() => void select(user.id)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none disabled:opacity-50 aria-selected:bg-blue-50"
              >
                <span className="block font-medium text-foreground">{user.name}</span>
                <span className="block text-xs text-muted">{ROLE_LABELS[user.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <span id="user-switcher-error" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
