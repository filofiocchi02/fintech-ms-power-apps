import { z } from 'zod';

import { nonEmptyString, reason, typedConfirmation } from '@/lib/validation/zod';

/** Flag environment as it arrives from a query string or request body. */
export const flagEnvironmentSchema = z.enum(['dev', 'staging', 'production']);

export const flagKeySchema = nonEmptyString.max(120);

/** Rollout percentage: whole percent, 0–100. No coercion — a string is a client bug. */
export const rolloutPercentageSchema = z.number().int().min(0).max(100);

/**
 * A cohort rule as the UI sends it. Cohort names are the flag system's identifiers, so they
 * are kept to a conservative character set rather than accepting arbitrary text.
 */
export const targetingRuleSchema = z.object({
  cohort: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, numbers and hyphens'),
  description: z.string().trim().max(160),
});

export const targetingSchema = z.array(targetingRuleSchema).max(10);

/** Identifier of a connector history entry to restore. */
export const historyIdSchema = nonEmptyString.max(120);

/**
 * A change request from the UI. Exactly one dimension — enabled, rollout, targeting or a
 * rollback — is applied per request, so the audit before/after pair describes a single
 * decision.
 *
 * Production additionally requires `reason` and `confirmation`; that check needs the flag
 * key and so lives in the service, which returns a typed validation error.
 */
export const flagChangeSchema = z
  .object({
    environment: flagEnvironmentSchema,
    enabled: z.boolean().optional(),
    rolloutPercentage: rolloutPercentageSchema.optional(),
    targeting: targetingSchema.optional(),
    rollbackTo: historyIdSchema.optional(),
    reason: reason.optional(),
    confirmation: typedConfirmation.optional(),
  })
  .refine(
    (value) =>
      [value.enabled, value.rolloutPercentage, value.targeting, value.rollbackTo].filter(
        (dimension) => dimension !== undefined,
      ).length === 1,
    {
      message: 'Provide exactly one of enabled, rolloutPercentage, targeting or rollbackTo',
      path: ['general'],
    },
  );

export type FlagChangeInput = z.infer<typeof flagChangeSchema>;

export const flagQuerySchema = z.object({
  environment: flagEnvironmentSchema,
  q: z.string().trim().max(120).optional(),
});
