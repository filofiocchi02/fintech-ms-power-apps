import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import type { Role } from './roles';
import { getDemoUser } from './users';

const DEMO_USER_COOKIE = 'demo-user';

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
 * The demo user is stored in a signed, server-readable cookie set exclusively by
 * POST /api/demo/role. The client never supplies the acting user in a request body,
 * query string, or JS cookie write — the server verifies the signature and resolves
 * capabilities from the user's role.
 */
export interface Actor {
  id: string;
  role: Role;
  displayName: string;
}

function signUser(userId: string): string {
  const signature = createHmac('sha256', getRoleSecret())
    .update(userId)
    .digest('base64url');
  return `${userId}.${signature}`;
}

function unsignUser(value: string): string | null {
  const [userId, signature] = value.split('.', 2);
  if (!userId || !signature || !getDemoUser(userId)) return null;

  const expected = createHmac('sha256', getRoleSecret())
    .update(userId)
    .digest('base64url');

  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  return userId;
}

/**
 * Resolves the current actor from the signed demo user cookie. Returns `null` when the
 * cookie is missing, malformed, or has an invalid signature.
 */
export async function getCurrentUser(): Promise<Actor | null> {
  const jar = await cookies();
  const raw = jar.get(DEMO_USER_COOKIE)?.value;
  if (!raw) return null;

  const userId = unsignUser(raw);
  const user = userId ? getDemoUser(userId) : null;
  if (!user) return null;

  return {
    id: user.id,
    role: user.role,
    displayName: user.name,
  };
}

/** Cookie attributes used when the user picker changes who we act as. */
export function roleCookieOptions() {
  return {
    name: DEMO_USER_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

/** Signs a user id so the route handler can set the cookie. */
export function encodeUserCookie(userId: string): string {
  return signUser(userId);
}
