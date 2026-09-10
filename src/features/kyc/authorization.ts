import { canAccessApp, canPerformAction, type Role } from '@/lib/auth/roles';

/**
 * KYC capability names, mapped onto the frozen capability model.
 *
 * The issue names three capabilities: app access, ordinary review, and sanctions override.
 * The first two are `kyc` app access and the `kyc:decide` action. The frozen model has no
 * dedicated override action, so the override is expressed with `platform:admin`, which only
 * Manager / Admin holds. Adding a `kyc:override` action is a shared change (see PR notes).
 */
export const KYC_APP = 'kyc' as const;
export const KYC_REVIEW_ACTION = 'kyc:decide' as const;
export const KYC_OVERRIDE_ACTION = 'platform:admin' as const;

/** May the role open the KYC tool and read its cases? */
export function canAccessKyc(role: Role): boolean {
  return canAccessApp(role, KYC_APP);
}

/** May the role decide an ordinary case? */
export function canReviewKyc(role: Role): boolean {
  return canPerformAction(role, KYC_REVIEW_ACTION);
}

/** May the role approve a case carrying a sanctions or PEP hit? */
export function canOverrideSanctions(role: Role): boolean {
  return canPerformAction(role, KYC_OVERRIDE_ACTION);
}
