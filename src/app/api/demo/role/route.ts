import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { roleCookieOptions } from '@/lib/auth/session';
import { isKnownRole } from '@/lib/auth/roles';
import { errorResponse, successResponse } from '@/lib/validation/api';
import { forbiddenError } from '@/lib/errors/errors';

/**
 * POST /api/demo/role
 *
 * Sets the server-readable demo role cookie. The client never writes the cookie directly and
 * never sends the role in request bodies to app routes; the server re-reads it from the jar
 * on every request.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      errorResponse(forbiddenError('Invalid JSON body')),
      { status: 403 },
    );
  }

  const role =
    typeof body === 'object' &&
    body !== null &&
    'role' in body &&
    typeof (body as { role?: unknown }).role === 'string'
      ? (body as { role: string }).role
      : null;

  if (!role || !isKnownRole(role)) {
    return NextResponse.json(
      errorResponse(forbiddenError('Invalid role')),
      { status: 403 },
    );
  }

  const options = roleCookieOptions();
  const jar = await cookies();
  jar.set(options.name, role, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: options.maxAge,
  });

  return NextResponse.json(successResponse({ role }), { status: 200 });
}
