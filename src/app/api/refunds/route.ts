import { jsonError, jsonSuccess, readJsonBody, requireRefundsApiAccess } from '@/features/refunds/api';
import { createRefundRequest } from '@/features/refunds/schemas';
import { getRefundService } from '@/features/refunds/server';
import { isAppError } from '@/lib/errors/errors';
import { parseOrAppError } from '@/lib/validation/zod';

/** GET /api/refunds — app-owned refund cases. Requires refunds app access. */
export async function GET() {
  const access = await requireRefundsApiAccess();
  if (!access.allowed) return access.response;

  return jsonSuccess({ cases: getRefundService().listCases() });
}

/**
 * POST /api/refunds — request a refund.
 *
 * App access is not enough: the service independently requires `refunds:request`, and a
 * refund over the approval threshold is recorded as PENDING_APPROVAL without any call to
 * the payments system.
 */
export async function POST(request: Request) {
  const access = await requireRefundsApiAccess();
  if (!access.allowed) return access.response;

  const body = await readJsonBody(request);
  if (isAppError(body)) return jsonError(body);

  const parsed = parseOrAppError(createRefundRequest, body, () => 'Invalid refund request');
  if (isAppError(parsed)) return jsonError(parsed);

  const result = await getRefundService().requestRefund(access.actor, parsed);
  if (!result.ok) return jsonError(result.error);

  return jsonSuccess(result.value, result.value.replayed ? 200 : 201);
}
