import { cookies } from 'next/headers';

import { isKnownRole, ROLE_LABELS, type Role } from './roles';

const DEMO_ROLE_COOKIE = 'demo-role';

/**
 * Server-only identity resolution.
 *
 * The demo role is stored in a cookie set exclusively by POST /api/demo/role. The client
 * never supplies the acting role in a request body, query string, or JS cookie write — the
 * server reads it from the cookie jar and resolves capabilities from it.
 */
export interface Actor {
  id: string;
  role: Role;
  displayName: string;
}

/**
 * Resolves the current actor from the demo role cookie. Returns `null` when the cookie is
 * missing or holds an unknown role.
 */
export async function getCurrentUser(): Promise<Actor | null> {
  const jar = await cookies();
  const raw = jar.get(DEMO_ROLE_COOKIE)?.value;
  if (!raw || !isKnownRole(raw)) return null;

  return {
    id: `demo_${raw}`,
    role: raw,
    displayName: ROLE_LABELS[raw],
  };
}

/** Cookie attributes used when the RoleSwitcher changes role. */
export function roleCookieOptions() {
  // Not httpOnly so the client can read the current role for the switcher UI, but the
  // server never trusts a client-supplied role — it always re-reads the cookie from the jar.
  return {
    name: DEMO_ROLE_COOKIE,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}
