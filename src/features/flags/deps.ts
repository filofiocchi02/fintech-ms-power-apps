import 'server-only';

import { getDb } from '@/db/client';
import { featureFlagConnector } from '@/lib/integrations/mock/feature-flags';
import { createAuditSink } from '@/lib/repositories/sqlite/audit';

import type { FlagDeps } from './service';

/**
 * Composition root for the flags tool. Pages and Route Handlers take their connector and
 * audit sink from here so no page, component or handler imports a mock module directly;
 * tests build their own `FlagDeps` against an isolated database.
 */
export function flagDeps(): FlagDeps {
  return { connector: featureFlagConnector, audit: createAuditSink(getDb()) };
}
