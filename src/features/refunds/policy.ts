/**
 * Approval policy for refunds.
 *
 * A refund over £500 is a "large" refund: the app records the request as
 * `PENDING_APPROVAL` and does not call the payments connector at all. Only a Manager/Admin
 * approval executes it, and only once.
 */

/** £500 in minor units. */
export const LARGE_REFUND_THRESHOLD_MINOR = 50_000;

/**
 * The prototype's ledger holds GBP, EUR and USD. Without an FX service the threshold is
 * applied to the transaction's own minor units; production converts to GBP before
 * comparing. Erring this way is safe: it can only send more refunds to approval, never
 * fewer.
 */
export function requiresApproval(amountMinor: number): boolean {
  return amountMinor > LARGE_REFUND_THRESHOLD_MINOR;
}
