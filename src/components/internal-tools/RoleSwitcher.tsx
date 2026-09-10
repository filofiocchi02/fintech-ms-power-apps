'use client';

import { useState } from 'react';

import { ROLE_LABELS, ROLES, type Role } from '@/lib/auth/roles';

interface Props {
  currentRole: Role | null;
}

export function RoleSwitcher({ currentRole }: Props) {
  const [role, setRole] = useState<Role | ''>(currentRole ?? '');
  const [pending, setPending] = useState(false);

  async function submit(value: Role) {
    setPending(true);
    try {
      const res = await fetch('/api/demo/role', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: value }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setPending(false);
      }
    } finally {
      setPending(false);
    }
  }

  return (
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
        className="rounded border border-border-subtle bg-surface px-2 py-1 text-sm text-foreground focus:border-blue-600 focus:outline-none"
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
  );
}
