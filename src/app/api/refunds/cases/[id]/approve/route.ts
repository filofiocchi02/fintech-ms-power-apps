import { jsonError, jsonSuccess, readOptionalJsonBody, requireRefundsApiAccess } from '@/features/refunds/api';
import { decideRefundRequest } from '@/features/refunds/schemas';
import { getRefundService } from '@/features/refunds/server';
import { isAppError } from '@/lib/errors/errors';
import { parseOrAppError } from '@/lib/validation/zod';

/**
 * POST /api/refunds/cases/:id/approve — Manager/Admin approval of a large refund.
 *
 * This is the only path that sends a large refund to the payments system, and the service
 * requires `refunds:approve` independently of app access. A case that already executed is
 * rejected here rather than refunded twice.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/refunds/cases/[id]/approve'>) {
  const access = await requireRefundsApiAccess();
  if (!access.allowed) return access.response;

  // An approval carries an optional note, so an empty body is legitimate; malformed JSON is not.
  const raw = await readOptionalJsonBody(request);
  if (isAppError(raw)) return jsonError(raw);

  const parsed = parseOrAppError(decideRefundRequest, raw, () => 'Invalid approval request');
  if (isAppError(parsed)) return jsonError(parsed);

  const { id } = await ctx.params;
  const result = await getRefundService().approveRefund(access.actor, id, parsed.decisionReason);
  if (!result.ok) return jsonError(result.error);

  return jsonSuccess(result.value);
}
