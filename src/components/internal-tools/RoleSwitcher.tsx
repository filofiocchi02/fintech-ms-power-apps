'use client';

import { useState } from 'react';

import { ROLE_LABELS, ROLES, type Role } from '@/lib/auth/roles';

interface Props {
  currentRole: Role | null;
}

export function RoleSwitcher({ currentRole }: Props) {
  const confirmedRole = currentRole ?? '';
  const [role, setRole] = useState<Role | ''>(confirmedRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: Role) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/demo/role', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: value }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }

      const body = (await res.json().catch(() => ({ success: false }))) as {
        success?: boolean;
        error?: { message?: string };
      };
      setError(body.error?.message ?? 'Role switch failed. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
      // Reset the dropdown to the last server-confirmed role so the UI never
      // displays a role the server did not accept.
      setRole(confirmedRole);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (role) void submit(role);
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="role-switcher" className="sr-only">
          Act as role
        </label>
        <select
          id="role-switcher"
          value={role}
          disabled={pending}
          onChange={(e) => {
            const value = e.target.value as Role;
            setRole(value);
            if (value) void submit(value);
          }}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? 'role-switcher-error' : undefined}
          className="rounded border border-border-subtle bg-surface px-2 py-1 text-sm text-foreground focus:border-blue-600 focus:outline-none disabled:opacity-50"
        >
          <option value="" disabled>
            Select role…
          </option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </form>
      {error && (
        <span id="role-switcher-error" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
