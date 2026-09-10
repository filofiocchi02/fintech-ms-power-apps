import 'server-only';

import { NextResponse } from 'next/server';

import { getActor, requireApiAppAccess } from '@/lib/auth/guards';
import type { Actor } from '@/lib/auth/session';
import { validationError, type AppError, type ErrorCode } from '@/lib/errors/errors';
import { errorResponse, successResponse, type ApiFailure } from '@/lib/validation/api';

/**
 * Route Handler plumbing shared by the refunds BFF.
 *
 * Every refunds route starts with `requireRefundsApiAccess`; the action-level check for a
 * mutation happens independently inside the service, so opening the app never implies
 * permission to move money.
 */

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  INTERNAL: 500,
};

export function jsonError(error: AppError): NextResponse {
  return NextResponse.json(errorResponse(error), { status: error.status });
}

export function jsonSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(successResponse(data), { status });
}

export async function requireRefundsApiAccess(): Promise<
  { allowed: true; actor: Actor } | { allowed: false; response: NextResponse }
> {
  const actor = await getActor();
  const access = requireApiAppAccess(actor, 'refunds');
  if (!access.success) {
    const failure = access as ApiFailure;
    const status = STATUS_BY_CODE[failure.error.code as ErrorCode] ?? 403;
    return { allowed: false, response: NextResponse.json(failure, { status }) };
  }
  return { allowed: true, actor: access.data.actor };
}

/** Reads a JSON body, returning a typed validation error rather than throwing. */
export async function readJsonBody(request: Request): Promise<unknown | AppError> {
  try {
    return await request.json();
  } catch {
    return validationError('Invalid JSON body');
  }
}
