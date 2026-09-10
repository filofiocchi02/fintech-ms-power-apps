import { NextResponse } from 'next/server';

import { kycDeps } from '@/features/kyc/deps';
import { failureResponse } from '@/features/kyc/http';
import { kycEscalateSchema } from '@/features/kyc/schemas';
import { escalateCase } from '@/features/kyc/service';
import { requireActionPermission, requireApiAppAccess } from '@/lib/auth/guards';
import { getCurrentUser } from '@/lib/auth/session';
import { isAppError, validationError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';
import { parseOrAppError } from '@/lib/validation/zod';

/**
 * POST /api/kyc/cases/:caseId/escalate — hand a held case up to the Manager / Admin tier.
 *
 * The domain layer re-checks that the actor actually holds the case, so an escalated case
 * can never be rerouted by someone it is not assigned to.
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

  const input = parseOrAppError(kycEscalateSchema, body, () => 'Invalid escalation');
  if (isAppError(input)) {
    return NextResponse.json(errorResponse(input), { status: input.status });
  }

  const { caseId } = await params;
  const result = await escalateCase(kycDeps(), permission.actor, { caseId, ...input });
  if (isAppError(result)) {
    return NextResponse.json(errorResponse(result), { status: result.status });
  }

  return NextResponse.json(successResponse({ case: result }), { status: 200 });
}
