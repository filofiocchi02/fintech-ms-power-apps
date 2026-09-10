import { forbiddenError, type AppError } from '@/lib/errors/errors';

import { isKnownRole, type Role } from './roles';

/**
 * The people a demo session can act as.
 *
 * Power Apps knows the signed-in person, not just their role — so the prototype models
 * named users rather than bare roles. Each user holds exactly one role; capabilities still
 * come from the role, never from the person. Two Compliance Analysts exist on purpose: it
 * makes assignment visible, because a case held by one analyst cannot be decided by the
 * other.
 *
 * Ids are stable because seeded workflow rows (assignees, escalation targets) point at
 * them.
 */
export interface DemoUser {
  id: string;
  name: string;
  role: Role;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { id: 'user_sam', name: 'Sam Whitfield', role: 'support' },
  { id: 'user_casey', name: 'Casey Nwosu', role: 'compliance' },
  { id: 'user_dana', name: 'Dana Reyes', role: 'compliance' },
  { id: 'user_riley', name: 'Riley Park', role: 'release-engineer' },
  { id: 'user_morgan', name: 'Morgan Hale', role: 'manager-admin' },
];

export function getDemoUser(id: string): DemoUser | null {
  return DEMO_USERS.find((user) => user.id === id) ?? null;
}

/** The first user holding a role — the sensible default when only a role is supplied. */
export function defaultUserForRole(role: Role): DemoUser | null {
  return DEMO_USERS.find((user) => user.role === role) ?? null;
}

/** Display name for an actor id, falling back to the raw id for non-demo actors. */
export function demoUserName(id: string): string {
  return getDemoUser(id)?.name ?? id;
}

/**
 * Parses the demo sign-in request. Accepts a specific `userId`, or a bare `role` which
 * resolves to that role's default user (kept for callers that predate named users). This
 * is only permitted for the demo sign-in endpoint; normal app routes must never accept an
 * identity from the client.
 */
export function parseDemoUser(body: unknown): DemoUser | AppError {
  if (typeof body !== 'object' || body === null) {
    return forbiddenError('Missing user');
  }
  if ('userId' in body && typeof (body as { userId?: unknown }).userId === 'string') {
    const userId = (body as { userId: string }).userId;
    const user = getDemoUser(userId);
    return user ?? forbiddenError(`Invalid user: ${userId}`);
  }
  if ('role' in body && typeof (body as { role?: unknown }).role === 'string') {
    const role = (body as { role: string }).role;
    if (isKnownRole(role)) {
      const user = defaultUserForRole(role);
      if (user) return user;
    }
    return forbiddenError(`Invalid role: ${role}`);
  }
  return forbiddenError('Missing user');
}
