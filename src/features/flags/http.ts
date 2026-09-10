import { NextResponse } from 'next/server';

import { internalError } from '@/lib/errors/errors';
import { errorResponse, type ApiFailure, type ApiResponse } from '@/lib/validation/api';

/**
 * `requireApiAppAccess` returns the typed envelope without an HTTP status, so map the error
 * code back to one. Denials must not leak anything beyond the code and message.
 */
const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
};

export function failureResponse(failure: ApiFailure): NextResponse {
  return NextResponse.json(failure, { status: STATUS_BY_CODE[failure.error.code] ?? 500 });
}

/**
 * Renders a guard result that is only ever consulted on the denied path. A success envelope
 * here would mean the caller checked the wrong branch, so it fails closed rather than
 * letting the mutation continue.
 */
export function denialResponse(response: ApiResponse<unknown>): NextResponse {
  return failureResponse(response.success ? errorResponse(internalError()) : response);
}
