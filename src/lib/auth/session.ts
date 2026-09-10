import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { isKnownRole, ROLE_LABELS, type Role } from './roles';

const DEMO_ROLE_COOKIE = 'demo-role';

function getRoleSecret(): string {
  const secret = process.env.DEMO_ROLE_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('DEMO_ROLE_SECRET environment variable is required in production');
  }
  // A dev-only default is acceptable for local prototyping because the cookie is never
  // trusted in production without an explicit secret.
  return secret ?? 'dev-only-not-a-secret';
}

/**
 * Server-only identity resolution.
 *
 * The demo role is stored in a signed, server-readable cookie set exclusively by
 * POST /api/demo/role. The client never supplies the acting role in a request body,
 * query string, or JS cookie write — the server verifies the signature and resolves
 * capabilities from it.
 */
export interface Actor {
  id: string;
  role: Role;
  displayName: string;
}

function signRole(role: Role): string {
  const signature = createHmac('sha256', getRoleSecret())
    .update(role)
    .digest('base64url');
  return `${role}.${signature}`;
}

function unsignRole(value: string): Role | null {
  const [role, signature] = value.split('.', 2);
  if (!role || !signature || !isKnownRole(role)) return null;

  const expected = createHmac('sha256', getRoleSecret())
    .update(role)
    .digest('base64url');

  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  return role;
}

/**
 * Resolves the current actor from the signed demo role cookie. Returns `null` when the
 * cookie is missing, malformed, or has an invalid signature.
 */
export async function getCurrentUser(): Promise<Actor | null> {
  const jar = await cookies();
  const raw = jar.get(DEMO_ROLE_COOKIE)?.value;
  if (!raw) return null;

  const role = unsignRole(raw);
  if (!role) return null;

  return {
    id: `demo_${role}`,
    role,
    displayName: ROLE_LABELS[role],
  };
}

/** Cookie attributes used when the RoleSwitcher changes role. */
export function roleCookieOptions() {
  return {
    name: DEMO_ROLE_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

/** Signs a role value so the route handler can set the cookie. */
export function encodeRoleCookie(role: Role): string {
  return signRole(role);
}
