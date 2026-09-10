import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { roleCookieOptions, encodeRoleCookie } from '@/lib/auth/session';
import { parseDemoRole } from '@/lib/auth/guards';
import { isAppError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';

/**
 * POST /api/demo/role
 *
 * Sets the signed, server-readable demo role cookie. The client never writes the cookie
 * directly and never sends the role in request bodies to app routes; the server verifies
 * the signature and re-reads it from the jar on every request.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      errorResponse({ code: 'VALIDATION', message: 'Invalid JSON body', status: 400 }),
      { status: 400 },
    );
  }

  const roleOrError = parseDemoRole(body);
  if (isAppError(roleOrError)) {
    return NextResponse.json(errorResponse(roleOrError), { status: roleOrError.status });
  }

  const options = roleCookieOptions();
  const jar = await cookies();
  jar.set(options.name, encodeRoleCookie(roleOrError), {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: options.maxAge,
  });

  return NextResponse.json(successResponse({ role: roleOrError }), { status: 200 });
}
