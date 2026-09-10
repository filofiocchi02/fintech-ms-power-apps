import { z } from 'zod';

/**
 * Shared Zod helpers so every route validates input consistently and returns typed errors.
 *
 * Feature sessions import these rather than redefining common shapes, which keeps error
 * messages and coercion behaviour identical across apps.
 */

/** Minor-unit money amount (pence). Rejects floats. */
export const amountMinor = z.coerce.number().int().nonnegative();

/** ISO 4217 currency code, uppercased. */
export const currency = z.string().min(3).max(3).toUpperCase();

/** Human-readable reason for an action. Required for destructive or financial mutations. */
export const reason = z.string().min(1).max(2000);

/** An idempotency key for payment-related or other replay-sensitive writes. */
export const idempotencyKey = z.string().min(1).max(255);

/** Typed confirmation value for dangerous actions (e.g. typing a flag key to delete). */
export const typedConfirmation = z.string().min(1).max(255);

/** Reference to an external record, case, payment or customer. */
export const externalRef = z.string().min(1).max(255);

/** Non-empty string. */
export const nonEmptyString = z.string().min(1);

/** A positive integer version for optimistic concurrency. */
export const version = z.coerce.number().int().positive();

export function parseOrAppError<T>(
  schema: z.ZodSchema<T>,
  value: unknown,
  onError: (issues: z.ZodIssue[]) => string,
): T | { code: 'VALIDATION'; message: string; details: Record<string, string | string[]> } {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details: Record<string, string | string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.length ? issue.path.join('.') : 'general';
      const existing = details[path];
      if (Array.isArray(existing)) {
        existing.push(issue.message);
      } else if (existing) {
        details[path] = [existing, issue.message];
      } else {
        details[path] = issue.message;
      }
    }
    return {
      code: 'VALIDATION',
      message: onError(result.error.issues),
      details,
    };
  }
  return result.data;
}
