import { NextResponse } from 'next/server';

import { kycDeps } from '@/features/kyc/deps';
import { failureResponse } from '@/features/kyc/http';
import { kycDecisionSchema } from '@/features/kyc/schemas';
import { decideCase } from '@/features/kyc/service';
import { requireActionPermission, requireApiAppAccess } from '@/lib/auth/guards';
import { getCurrentUser } from '@/lib/auth/session';
import { isAppError, validationError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';
import { parseOrAppError } from '@/lib/validation/zod';

/**
 * POST /api/kyc/cases/:caseId/decision — approve or reject a case.
 *
 * App access and the decide permission are checked independently here, and again in the
 * domain layer along with the document and sanctions rules, so no caller can reach a
 * mutation by skipping the UI.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const actor = await getCurrentUser();

  const access = requireApiAppAccess(actor, 'kyc');
  if (!access.success) return failureResponse(access);

  const permission = requireActionPermission(actor, 'kyc:decide');
  if (!permission.allowed) return failureResponse(permission.response);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = validationError('Invalid JSON body');
    return NextResponse.json(errorResponse(error), { status: error.status });
  }

  const input = parseOrAppError(kycDecisionSchema, body, () => 'Invalid decision');
  if (isAppError(input)) {
    return NextResponse.json(errorResponse(input), { status: input.status });
  }

  const { caseId } = await params;
  const result = await decideCase(kycDeps(), permission.actor, { caseId, ...input });
  if (isAppError(result)) {
    return NextResponse.json(errorResponse(result), { status: result.status });
  }

  return NextResponse.json(successResponse({ case: result }), { status: 200 });
}
