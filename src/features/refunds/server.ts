import 'server-only';

import { getDb } from '@/db/client';
import { customerConnector } from '@/lib/integrations/mock/customers';
import { createAuditSink } from '@/lib/repositories/sqlite/audit';
import { createWorkflowRepository } from '@/lib/repositories/sqlite/workflow';

import { refundsPaymentsConnector } from './payments';
import { createRefundService, type RefundService } from './service';

/**
 * Composition root for the refunds app.
 *
 * Pages and Route Handlers depend on this, never on a connector mock or a fixture. Tests
 * build their own service with an isolated database via `createRefundService`.
 */
export function getRefundService(): RefundService {
  const db = getDb();
  return createRefundService({
    payments: refundsPaymentsConnector,
    customers: customerConnector,
    workflow: createWorkflowRepository(db),
    audit: createAuditSink(db),
  });
}
