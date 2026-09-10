import { NextResponse } from 'next/server';

import { flagDeps } from '@/features/flags/deps';
import { denialResponse, failureResponse } from '@/features/flags/http';
import { applyFlagChange, getFlagDetail } from '@/features/flags/service';
import { getActor, requireActionPermission, requireApiAppAccess } from '@/lib/auth/guards';
import { isAppError, validationError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';

/**
 * Per-flag reads and changes.
 *
 * App access and the write permission are checked independently: opening the flags page does
 * not entitle an operator to change a value, and the production restriction is enforced in
 * the service on top of both.
 */

interface Context {
  params: Promise<{ key: string }>;
}

export async function GET(request: Request, context: Context) {
  const actor = await getActor();
  const access = requireApiAppAccess(actor, 'flags');
  if (!access.success) {
    return failureResponse(access);
  }

  const { key } = await context.params;
  const url = new URL(request.url);
  const result = getFlagDetail(flagDeps(), key, url.searchParams.get('environment') ?? undefined);

  if (isAppError(result)) {
    return NextResponse.json(errorResponse(result), { status: result.status });
  }

  return NextResponse.json(successResponse(result));
}

export async function PATCH(request: Request, context: Context) {
  const actor = await getActor();
  const access = requireApiAppAccess(actor, 'flags');
  if (!access.success) {
    return failureResponse(access);
  }

  const permission = requireActionPermission(access.data.actor, 'flags:write');
  if (!permission.allowed) {
    return denialResponse(permission.response);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = validationError('Invalid JSON body');
    return NextResponse.json(errorResponse(error), { status: error.status });
  }

  const { key } = await context.params;
  const result = await applyFlagChange(flagDeps(), permission.actor, key, body);

  if (isAppError(result)) {
    return NextResponse.json(errorResponse(result), { status: result.status });
  }

  return NextResponse.json(successResponse({ flag: result }));
}
