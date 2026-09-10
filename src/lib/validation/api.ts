import { type AppError } from '@/lib/errors/errors';

/**
 * Common JSON envelope for Route Handler responses.
 *
 * Every response is `{ success: boolean, data?: T, error?: { code, message, details } }`.
 * Keeping the shape consistent lets the shared ErrorState component render failures without
 * needing per-route parsing.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string | string[]>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type TypedResponse =
  | { success: true; data?: unknown }
  | { success: false; error: AppError };

export function successResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function errorResponse(error: AppError): ApiFailure {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  };
}
