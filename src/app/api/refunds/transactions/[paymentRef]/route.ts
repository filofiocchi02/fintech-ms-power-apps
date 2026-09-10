import { jsonError, jsonSuccess, requireRefundsApiAccess } from '@/features/refunds/api';
import { getRefundService } from '@/features/refunds/server';

/**
 * GET /api/refunds/transactions/:paymentRef — authoritative transaction, its payment-system
 * refund history, and the app's own refund cases and audit for it.
 */
export async function GET(_request: Request, ctx: RouteContext<'/api/refunds/transactions/[paymentRef]'>) {
  const access = await requireRefundsApiAccess();
  if (!access.allowed) return access.response;

  const { paymentRef } = await ctx.params;
  const result = getRefundService().getTransactionDetail(paymentRef);
  if (!result.ok) return jsonError(result.error);

  return jsonSuccess(result.value);
}
