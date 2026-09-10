import { NextResponse } from 'next/server';

import { internalError } from '@/lib/errors/errors';
import { errorResponse, type ApiResponse } from '@/lib/validation/api';

/**
 * `requireApiAppAccess` returns the typed failure envelope without the HTTP status, so the
 * route maps the code back to a status here rather than each handler inventing one.
 */
const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  INTERNAL: 500,
};

export function failureResponse(response: ApiResponse<unknown>): NextResponse {
  if (response.success) {
    // Only denial envelopes reach this helper; a success here is a programming error.
    return NextResponse.json(errorResponse(internalError()), { status: 500 });
  }
  return NextResponse.json(response, { status: STATUS_BY_CODE[response.error.code] ?? 500 });
}
