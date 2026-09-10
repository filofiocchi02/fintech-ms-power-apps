import { z } from 'zod';

import { jsonError, jsonSuccess, readJsonBody, requireRefundsApiAccess } from '@/features/refunds/api';
import { getRefundService } from '@/features/refunds/server';
import { isAppError } from '@/lib/errors/errors';
import { parseOrAppError, reason as reasonSchema } from '@/lib/validation/zod';

const rejectRequest = z.object({ decisionReason: reasonSchema });

/**
 * POST /api/refunds/cases/:id/reject — Manager/Admin rejection of a pending refund.
 * Nothing reaches the payments system on this path.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/refunds/cases/[id]/reject'>) {
  const access = await requireRefundsApiAccess();
  if (!access.allowed) return access.response;

  const raw = await readJsonBody(request);
  if (isAppError(raw)) return jsonError(raw);

  const parsed = parseOrAppError(rejectRequest, raw, () => 'A rejection reason is required');
  if (isAppError(parsed)) return jsonError(parsed);

  const { id } = await ctx.params;
  const result = await getRefundService().rejectRefund(access.actor, id, parsed.decisionReason);
  if (!result.ok) return jsonError(result.error);

  return jsonSuccess(result.value);
}
