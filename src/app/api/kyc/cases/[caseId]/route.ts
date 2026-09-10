import { NextResponse } from 'next/server';

import { kycDeps } from '@/features/kyc/deps';
import { failureResponse } from '@/features/kyc/http';
import { getCaseDetail } from '@/features/kyc/service';
import { requireApiAppAccess } from '@/lib/auth/guards';
import { getCurrentUser } from '@/lib/auth/session';
import { isAppError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';

/** GET /api/kyc/cases/:caseId — one case with its evidence and audit timeline. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const access = requireApiAppAccess(await getCurrentUser(), 'kyc');
  if (!access.success) return failureResponse(access);

  const { caseId } = await params;
  const detail = getCaseDetail(kycDeps(), access.data.actor, caseId);
  if (isAppError(detail)) {
    return NextResponse.json(errorResponse(detail), { status: detail.status });
  }

  return NextResponse.json(successResponse(detail), { status: 200 });
}
