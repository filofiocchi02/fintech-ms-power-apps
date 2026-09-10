import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { roleCookieOptions, encodeUserCookie } from '@/lib/auth/session';
import { parseDemoUser } from '@/lib/auth/users';
import { isAppError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';

/**
 * POST /api/demo/role
 *
 * Sets the signed, server-readable demo user cookie. The client never writes the cookie
 * directly and never sends the user in request bodies to app routes; the server verifies
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

  const userOrError = parseDemoUser(body);
  if (isAppError(userOrError)) {
    return NextResponse.json(errorResponse(userOrError), { status: userOrError.status });
  }

  const options = roleCookieOptions();
  const jar = await cookies();
  jar.set(options.name, encodeUserCookie(userOrError.id), {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: options.maxAge,
  });

  return NextResponse.json(successResponse({ user: userOrError }), { status: 200 });
}
