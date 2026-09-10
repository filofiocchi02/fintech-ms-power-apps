import { NextResponse } from 'next/server';

import { kycDeps } from '@/features/kyc/deps';
import { failureResponse } from '@/features/kyc/http';
import { kycQueueFiltersSchema, queryToFilterInput } from '@/features/kyc/schemas';
import { listQueue } from '@/features/kyc/service';
import { requireApiAppAccess } from '@/lib/auth/guards';
import { getCurrentUser } from '@/lib/auth/session';
import { isAppError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';
import { parseOrAppError } from '@/lib/validation/zod';

/**
 * GET /api/kyc/cases — the filtered review queue.
 *
 * Filtering happens in the domain layer, so a response can never contain a case the actor
 * is not allowed to see, whatever the query string says.
 */
export async function GET(request: Request) {
  const access = requireApiAppAccess(await getCurrentUser(), 'kyc');
  if (!access.success) return failureResponse(access);

  const filters = parseOrAppError(
    kycQueueFiltersSchema,
    queryToFilterInput(new URL(request.url).searchParams),
    () => 'Invalid queue filters',
  );
  if (isAppError(filters)) {
    return NextResponse.json(errorResponse(filters), { status: filters.status });
  }

  const cases = listQueue(kycDeps(), access.data.actor, filters);
  if (isAppError(cases)) {
    return NextResponse.json(errorResponse(cases), { status: cases.status });
  }

  return NextResponse.json(successResponse({ cases }), { status: 200 });
}
