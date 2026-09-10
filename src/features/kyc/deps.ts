import 'server-only';

import { getDb } from '@/db/client';
import { customerConnector } from '@/lib/integrations/mock/customers';
import { kycReviewProviderConnector } from '@/lib/integrations/mock/kyc';
import { createAuditSink } from '@/lib/repositories/sqlite/audit';
import { createWorkflowRepository } from '@/lib/repositories/sqlite/workflow';

import type { KycDeps } from './service';

/** Wires the KYC domain layer to the running app's repositories and connectors. */
export function kycDeps(): KycDeps {
  const db = getDb();
  return {
    workflow: createWorkflowRepository(db),
    audit: createAuditSink(db),
    customers: customerConnector,
    provider: kycReviewProviderConnector,
  };
}
