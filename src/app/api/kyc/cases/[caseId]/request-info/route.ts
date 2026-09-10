import { NextResponse } from 'next/server';

import { kycDeps } from '@/features/kyc/deps';
import { failureResponse } from '@/features/kyc/http';
import { kycRequestInfoSchema } from '@/features/kyc/schemas';
import { requestMoreInfo } from '@/features/kyc/service';
import { requireActionPermission, requireApiAppAccess } from '@/lib/auth/guards';
import { getCurrentUser } from '@/lib/auth/session';
import { isAppError, validationError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';
import { parseOrAppError } from '@/lib/validation/zod';

/**
 * POST /api/kyc/cases/:caseId/request-info — ask the customer for more evidence.
 *
 * Unlike decision and escalation, a request does not require holding the case: any
 * reviewer with `kyc:assign` may ask — a manager can request more information on a case
 * an analyst holds. The domain layer enforces the rest (access, capability, non-terminal
 * case, optimistic concurrency) and audits the attempt.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const actor = await getCurrentUser();

  const access = requireApiAppAccess(actor, 'kyc');
  if (!access.success) return failureResponse(access);

  const permission = requireActionPermission(actor, 'kyc:assign');
  if (!permission.allowed) return failureResponse(permission.response);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = validationError('Invalid JSON body');
    return NextResponse.json(errorResponse(error), { status: error.status });
  }

  const input = parseOrAppError(kycRequestInfoSchema, body, () => 'Invalid information request');
  if (isAppError(input)) {
    return NextResponse.json(errorResponse(input), { status: input.status });
  }

  const { caseId } = await params;
  const result = await requestMoreInfo(kycDeps(), permission.actor, { caseId, ...input });
  if (isAppError(result)) {
    return NextResponse.json(errorResponse(result), { status: result.status });
  }

  return NextResponse.json(successResponse({ case: result }), { status: 200 });
}
