/**
 * Typed, safe errors for the Route Handler BFF.
 *
 * The UI receives a stable `code`, an end-user `message`, and an optional `details` map.
 * Stack traces and internal messages never leave the server.
 */
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'INTERNAL';

export interface AppError {
  code: ErrorCode;
  message: string;
  status: number;
  details?: Record<string, string | string[]>;
}

export function appError(
  code: ErrorCode,
  message: string,
  status: number,
  details?: Record<string, string | string[]>,
): AppError {
  return { code, message, status, details };
}

export function unauthorizedError(message = 'Sign in required'): AppError {
  return appError('UNAUTHORIZED', message, 401);
}

export function forbiddenError(message = 'Access denied'): AppError {
  return appError('FORBIDDEN', message, 403);
}

export function notFoundError(message = 'Not found'): AppError {
  return appError('NOT_FOUND', message, 404);
}

export function validationError(
  message = 'Validation failed',
  details?: Record<string, string | string[]>,
): AppError {
  return appError('VALIDATION', message, 400, details);
}

export function conflictError(message = 'Conflict'): AppError {
  return appError('CONFLICT', message, 409);
}

export function preconditionError(message = 'Precondition failed'): AppError {
  return appError('PRECONDITION_FAILED', message, 412);
}

export function internalError(message = 'Something went wrong'): AppError {
  return appError('INTERNAL', message, 500);
}

/** Narrow an value to AppError at runtime. */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as AppError).code === 'string' &&
    'message' in value &&
    typeof (value as AppError).message === 'string' &&
    'status' in value &&
    typeof (value as AppError).status === 'number'
  );
}
