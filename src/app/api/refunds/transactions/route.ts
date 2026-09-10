import type { NextRequest } from 'next/server';

import { jsonError, jsonSuccess, requireRefundsApiAccess } from '@/features/refunds/api';
import { searchQuery } from '@/features/refunds/schemas';
import { getRefundService } from '@/features/refunds/server';
import { isAppError } from '@/lib/errors/errors';
import { parseOrAppError } from '@/lib/validation/zod';

/**
 * GET /api/refunds/transactions?q= — search the payments system by customer, email domain
 * or payment/customer reference. Read-only, and still gated on refunds app access.
 */
export async function GET(request: NextRequest) {
  const access = await requireRefundsApiAccess();
  if (!access.allowed) return access.response;

  const parsed = parseOrAppError(
    searchQuery,
    { q: request.nextUrl.searchParams.get('q') ?? undefined },
    () => 'Invalid search query',
  );
  if (isAppError(parsed)) return jsonError(parsed);

  return jsonSuccess({ transactions: getRefundService().searchTransactions(parsed.q ?? '') });
}
