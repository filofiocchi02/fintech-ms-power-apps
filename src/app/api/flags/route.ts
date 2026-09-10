import { NextResponse } from 'next/server';

import { flagDeps } from '@/features/flags/deps';
import { failureResponse } from '@/features/flags/http';
import { listFlags } from '@/features/flags/service';
import { getActor, requireApiAppAccess } from '@/lib/auth/guards';
import { isAppError } from '@/lib/errors/errors';
import { errorResponse, successResponse } from '@/lib/validation/api';

/**
 * GET /api/flags?environment=dev&q=search
 *
 * Lists flags for one environment straight from the connector. The environment always comes
 * from the request; the server never infers it from the UI's last known state.
 */
export async function GET(request: Request) {
  const actor = await getActor();
  const access = requireApiAppAccess(actor, 'flags');
  if (!access.success) {
    return failureResponse(access);
  }

  const url = new URL(request.url);
  const result = listFlags(flagDeps(), {
    environment: url.searchParams.get('environment') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
  });

  if (isAppError(result)) {
    return NextResponse.json(errorResponse(result), { status: result.status });
  }

  return NextResponse.json(successResponse(result));
}
