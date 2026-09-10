import { canPerformAction, type Role } from '@/lib/auth/roles';
import { forbiddenError, type AppError } from '@/lib/errors/errors';
import type { FlagEnvironment } from '@/lib/integrations/types';

/**
 * Environment-keyed write permission for feature flags.
 *
 * `ROLE_ACTIONS` is frozen and only distinguishes `flags:read` from `flags:write`, so the
 * production restriction is derived here: writing a non-production environment needs
 * `flags:write`, and writing production additionally needs the Manager/Admin role. The
 * desired shared change — a `flags:write_prod` action in `src/lib/auth/roles.ts` held only
 * by Manager/Admin — is described in the PR instead of made from this branch.
 */

/** Roles allowed to change production flag values. */
const PRODUCTION_WRITE_ROLES: readonly Role[] = ['manager-admin'];

export function canWriteFlags(role: Role): boolean {
  return canPerformAction(role, 'flags:write');
}

export function canWriteProductionFlags(role: Role): boolean {
  return canWriteFlags(role) && PRODUCTION_WRITE_ROLES.includes(role);
}

export function canWriteEnvironment(role: Role, environment: FlagEnvironment): boolean {
  return environment === 'production' ? canWriteProductionFlags(role) : canWriteFlags(role);
}

/** Returns a typed error when the role may not write this environment, otherwise null. */
export function flagWriteDenial(role: Role, environment: FlagEnvironment): AppError | null {
  if (!canWriteFlags(role)) {
    return forbiddenError(`Action flags:write is not permitted for ${role}`);
  }
  if (environment === 'production' && !canWriteProductionFlags(role)) {
    return forbiddenError('Production flag changes are restricted to Manager / Admin');
  }
  return null;
}
