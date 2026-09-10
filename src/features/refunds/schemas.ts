import { z } from 'zod';

import { amountMinor, externalRef, idempotencyKey, reason } from '@/lib/validation/zod';

/**
 * Request shapes for the refunds BFF. Every route parses its body through these before any
 * connector or repository call, so a tampered client request is rejected as a typed
 * validation error rather than reaching the payments layer.
 */

export const createRefundRequest = z.object({
  paymentRef: externalRef,
  amountMinor,
  reason,
  idempotencyKey,
  /** The operator must confirm explicitly; the UI dialog sets this. */
  confirmed: z.literal(true),
});

export type CreateRefundRequest = z.infer<typeof createRefundRequest>;

export const decideRefundRequest = z.object({
  decisionReason: reason.optional(),
});

export type DecideRefundRequest = z.infer<typeof decideRefundRequest>;

export const searchQuery = z.object({
  q: z.string().trim().max(255).optional(),
});
