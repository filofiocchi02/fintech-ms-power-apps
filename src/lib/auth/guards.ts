import { forbidden, notFound, redirect } from 'next/navigation';

import { AppError, forbiddenError, unauthorizedError } from '@/lib/errors/errors';
import { errorResponse, type ApiResponse } from '@/lib/validation/api';

import { canAccessApp, canPerformAction, type App, type AppAction, type Role } from './roles';
import { getCurrentUser, type Actor } from './session';

/** Common reason a protected request is denied. */
export interface DenialReason {
  actor: Actor | null;
  required: Capability;
}

export type Capability = { app: App } | { action: AppAction };

/**
 * Resolves the current actor for a server page or component.
 * If the demo role cookie is missing/invalid, returns `null`.
 */
export async function getActor(): Promise<Actor | null> {
  return getCurrentUser();
}

/**
 * Page-level guard. Returns the actor if allowed, otherwise renders an explicit denied state
 * (no data leaked) instead of throwing a raw 403.
 *
 * Use in Server Components: `const guard = await requireAppAccess('kyc')`.
 */
export async function requireAppAccess(
  app: App,
): Promise<{ allowed: true; actor: Actor } | { allowed: false; reason: DenialReason }> {
  const actor = await getActor();
  if (!actor) {
    return { allowed: false, reason: { actor: null, required: { app } } };
  }
  if (!canAccessApp(actor.role, app)) {
    return { allowed: false, reason: { actor, required: { app } } };
  }
  return { allowed: true, actor };
}

/** Convenience for page.tsx files: return the actor or stop rendering the page. */
export async function requireAppAccessOrDenied(
  app: App,
): Promise<{ actor: Actor; denied: false } | { denied: true; reason: DenialReason }> {
  const result = await requireAppAccess(app);
  if (!result.allowed) {
    return { denied: true, reason: result.reason };
  }
  return { denied: false, actor: result.actor };
}

/**
 * Route Handler guard for app-level access. Returns a typed API response; the caller should
 * return it directly so no mutation runs.
 */
export function requireApiAppAccess(
  actor: Actor | null,
  app: App,
): ApiResponse<{ actor: Actor }> {
  if (!actor) {
    return errorResponse(unauthorizedError('Sign in required'));
  }
  if (!canAccessApp(actor.role, app)) {
    return errorResponse(forbiddenError(`Access to ${app} is not permitted for ${actor.role}`));
  }
  return { success: true, data: { actor } };
}

/**
 * Action-level permission guard. Use this inside a handler that has already passed the
 * app-access check. A user who can open a page is not thereby allowed to act on it.
 */
export function requireActionPermission(
  actor: Actor | null,
  action: AppAction,
): { allowed: true; actor: Actor } | { allowed: false; response: ApiResponse<unknown> } {
  if (!actor) {
    return { allowed: false, response: errorResponse(unauthorizedError('Sign in required')) };
  }
  if (!canPerformAction(actor.role, action)) {
    return {
      allowed: false,
      response: errorResponse(
        forbiddenError(`Action ${action} is not permitted for ${actor.role}`),
      ),
    };
  }
  return { allowed: true, actor };
}

/** Helpers to force a hard navigation response for direct forbidden URLs. */
export function redirectToDenied(): never {
  redirect('/access-denied');
}

export function hardForbidden(): never {
  forbidden();
}

export function hardNotFound(): never {
  notFound();
}

/**
 * Parses a request body that includes a role. This is only permitted for the demo role
 * switcher endpoint; normal app routes must never accept a role from the client.
 */
export function parseDemoRole(body: unknown): Role | AppError {
  if (
    typeof body === 'object' &&
    body !== null &&
    'role' in body &&
    typeof (body as { role?: unknown }).role === 'string'
  ) {
    const role = (body as { role: string }).role;
    if (role === 'support' || role === 'compliance' || role === 'release-engineer' || role === 'manager-admin') {
      return role;
    }
    return forbiddenError(`Invalid role: ${role}`);
  }
  return forbiddenError('Missing role');
}
