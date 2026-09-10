import { z } from 'zod';

import { nonEmptyString, reason, typedConfirmation } from '@/lib/validation/zod';

/** Flag environment as it arrives from a query string or request body. */
export const flagEnvironmentSchema = z.enum(['dev', 'staging', 'production']);

export const flagKeySchema = nonEmptyString.max(120);

/** Rollout percentage: whole percent, 0–100. No coercion — a string is a client bug. */
export const rolloutPercentageSchema = z.number().int().min(0).max(100);

/**
 * A change request from the UI. Exactly one of `enabled` / `rolloutPercentage` is applied
 * per request so the audit before/after pair describes a single decision.
 *
 * Production additionally requires `reason` and `confirmation`; that check needs the flag
 * key and so lives in the service, which returns a typed validation error.
 */
export const flagChangeSchema = z
  .object({
    environment: flagEnvironmentSchema,
    enabled: z.boolean().optional(),
    rolloutPercentage: rolloutPercentageSchema.optional(),
    reason: reason.optional(),
    confirmation: typedConfirmation.optional(),
  })
  .refine(
    (value) => (value.enabled === undefined) !== (value.rolloutPercentage === undefined),
    { message: 'Provide either enabled or rolloutPercentage', path: ['general'] },
  );

export type FlagChangeInput = z.infer<typeof flagChangeSchema>;

export const flagQuerySchema = z.object({
  environment: flagEnvironmentSchema,
  q: z.string().trim().max(120).optional(),
});
