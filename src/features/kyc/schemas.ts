import { z } from 'zod';

import { KYC_WORKFLOW_STATUS } from '@/db/schema';
import { nonEmptyString, reason, version } from '@/lib/validation/zod';

/** Query parameters for the review queue. Every filter is optional and applied server-side. */
export const kycQueueFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(KYC_WORKFLOW_STATUS).optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  assignee: nonEmptyString.max(200).optional(),
});

export const kycDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason,
  expectedVersion: version,
});

export type KycQueueFiltersInput = z.infer<typeof kycQueueFiltersSchema>;
export type KycDecisionInput = z.infer<typeof kycDecisionSchema>;

/** Drops blank query-string values so `?status=` behaves like an absent filter. */
export function queryToFilterInput(params: URLSearchParams): Record<string, string> {
  const input: Record<string, string> = {};
  for (const key of ['search', 'status', 'risk', 'country', 'assignee']) {
    const value = params.get(key);
    if (value !== null && value.trim() !== '') input[key] = value;
  }
  return input;
}
