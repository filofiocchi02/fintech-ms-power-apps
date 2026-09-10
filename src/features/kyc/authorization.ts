import { canAccessApp, canPerformAction, type Role } from '@/lib/auth/roles';
import { defaultUserForRole } from '@/lib/auth/users';

/**
 * KYC capability names, mapped onto the frozen capability model.
 *
 * The issue names three capabilities: app access, ordinary review, and sanctions override.
 * The first two are `kyc` app access and the `kyc:decide` action. The frozen model has no
 * dedicated override action, so the override is expressed with `platform:admin`, which only
 * Manager / Admin holds. Adding a `kyc:override` action is a shared change (see PR notes).
 *
 * Claiming and escalating both move the case's assignee, so both sit behind the existing
 * `kyc:assign` action. `kyc:escalate` exists only as an audit action label, so the case
 * timeline distinguishes a hand-up from a self-claim.
 */
export const KYC_APP = 'kyc' as const;
export const KYC_REVIEW_ACTION = 'kyc:decide' as const;
export const KYC_ASSIGN_ACTION = 'kyc:assign' as const;
export const KYC_ESCALATE_ACTION = 'kyc:escalate' as const;
export const KYC_REQUEST_INFO_ACTION = 'kyc:request-info' as const;
export const KYC_OVERRIDE_ACTION = 'platform:admin' as const;

/**
 * Escalation hands a case to the Manager / Admin review tier.
 *
 * The demo has a single manager user, so the target is that user's id. Production resolves
 * a real manager queue or group from the IdP instead; the service layer only depends on
 * this function returning an id.
 */
export function escalationTargetAssigneeId(role: Role): string | null {
  return role === 'manager-admin' ? null : (defaultUserForRole('manager-admin')?.id ?? null);
}

/** May the role open the KYC tool and read its cases? */
export function canAccessKyc(role: Role): boolean {
  return canAccessApp(role, KYC_APP);
}

/** May the role decide an ordinary case? */
export function canReviewKyc(role: Role): boolean {
  return canPerformAction(role, KYC_REVIEW_ACTION);
}

/** May the role claim a case, or escalate one it holds? */
export function canAssignKyc(role: Role): boolean {
  return canPerformAction(role, KYC_ASSIGN_ACTION);
}

/** May the role approve a case carrying a sanctions or PEP hit? */
export function canOverrideSanctions(role: Role): boolean {
  return canPerformAction(role, KYC_OVERRIDE_ACTION);
}
