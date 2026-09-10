import type { Actor } from '@/lib/auth/session';
import {
  conflictError,
  internalError,
  isAppError,
  notFoundError,
  validationError,
  type AppError,
} from '@/lib/errors/errors';
import type { FlagEnvironment } from '@/lib/integrations/types';
import type { AuditEventRow, AuditSink } from '@/lib/repositories/types';
import { parseOrAppError } from '@/lib/validation/zod';

import type { AdminFeatureFlag, AdminFlagHistoryEntry, FlagAdminConnector } from './contracts';
import { flagWriteDenial } from './permissions';
import { flagChangeSchema, flagQuerySchema } from './schemas';

/**
 * Server-side flag administration.
 *
 * Flag values and change history are authoritative in `FeatureFlagConnector`: this module
 * reads them on every request and never caches or persists them. What it does own is the
 * internal-tool audit trail, which records who used this console to make a change and why,
 * and is kept separate from the connector's own history.
 */

export interface FlagDeps {
  connector: FlagAdminConnector;
  audit: AuditSink;
}

export const AUDIT_SUBJECT_TYPE = 'flag';

/** Audit subject for a flag in one environment: a prod change is not a dev change. */
export function flagSubjectRef(key: string, environment: FlagEnvironment): string {
  return `${environment}:${key}`;
}

export interface FlagListView {
  environment: FlagEnvironment;
  query: string;
  flags: AdminFeatureFlag[];
}

export function listFlags(
  deps: FlagDeps,
  params: { environment: unknown; q?: unknown },
): FlagListView | AppError {
  const parsed = parseOrAppError(flagQuerySchema, params, () => 'Invalid flag query');
  if (isAppError(parsed)) return parsed;

  const needle = parsed.q?.toLowerCase() ?? '';
  const flags = deps.connector
    .listFlags(parsed.environment)
    .filter(
      (flag) =>
        needle === '' ||
        flag.key.toLowerCase().includes(needle) ||
        flag.description.toLowerCase().includes(needle),
    );

  return { environment: parsed.environment, query: parsed.q ?? '', flags };
}

export interface FlagDetailView {
  flag: AdminFeatureFlag;
  /** Authoritative change history, owned by the flag system. */
  connectorHistory: AdminFlagHistoryEntry[];
  /** What operators did in this console. Never merged with connector history. */
  appAudit: AuditEventRow[];
}

export function getFlagDetail(
  deps: FlagDeps,
  key: string,
  environment: unknown,
): FlagDetailView | AppError {
  const parsed = parseOrAppError(flagQuerySchema, { environment }, () => 'Invalid environment');
  if (isAppError(parsed)) return parsed;

  const flag = deps.connector.getFlag(key, parsed.environment);
  if (!flag) return notFoundError('Flag not found in this environment');

  return {
    flag,
    connectorHistory: deps.connector.getHistory(key, parsed.environment),
    appAudit: deps.audit.listForSubject(AUDIT_SUBJECT_TYPE, flagSubjectRef(key, parsed.environment)),
  };
}

function snapshot(flag: AdminFeatureFlag) {
  return {
    environment: flag.environment,
    enabled: flag.enabled,
    rolloutPercentage: flag.rolloutPercentage,
  };
}

export async function applyFlagChange(
  deps: FlagDeps,
  actor: Actor,
  key: string,
  body: unknown,
): Promise<AdminFeatureFlag | AppError> {
  const input = parseOrAppError(flagChangeSchema, body, () => 'Invalid flag change request');
  if (isAppError(input)) return input;

  const { environment } = input;
  const subjectRef = flagSubjectRef(key, environment);

  const denial = flagWriteDenial(actor.role, environment);
  if (denial) {
    await deps.audit.emit({
      app: 'flags',
      action: 'flags:write',
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: AUDIT_SUBJECT_TYPE,
      subjectRef,
      outcome: 'DENIED',
      reason: denial.message,
    });
    return denial;
  }

  const before = deps.connector.getFlag(key, environment);
  if (!before) return notFoundError('Flag not found in this environment');

  if (environment === 'production') {
    const productionError = productionRequirementError(key, input.reason, input.confirmation);
    if (productionError) {
      await deps.audit.emit({
        app: 'flags',
        action: 'flags:write',
        actorId: actor.id,
        actorRole: actor.role,
        subjectType: AUDIT_SUBJECT_TYPE,
        subjectRef,
        outcome: 'DENIED',
        reason: productionError.message,
        before: snapshot(before),
      });
      return productionError;
    }
  }

  const reason = input.reason ?? '';
  const result =
    input.enabled !== undefined
      ? deps.connector.setFlag(key, environment, input.enabled, actor.id, reason)
      : deps.connector.setRollout(
          key,
          environment,
          input.rolloutPercentage ?? before.rolloutPercentage,
          actor.id,
          reason,
        );

  if ('error' in result) {
    await deps.audit.emit({
      app: 'flags',
      action: 'flags:write',
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: AUDIT_SUBJECT_TYPE,
      subjectRef,
      outcome: 'FAILED',
      reason: result.error,
      before: snapshot(before),
    });
    return conflictError(result.error);
  }

  // The flag system has already applied the change, so a failed audit write cannot be
  // reported as a failed change: that invites a retry that would move the flag twice. Say
  // what actually happened instead — the change stands, the audit record is missing.
  try {
    await deps.audit.emit({
      app: 'flags',
      action: 'flags:write',
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: AUDIT_SUBJECT_TYPE,
      subjectRef,
      outcome: 'ACCEPTED',
      reason: reason || undefined,
      before: snapshot(before),
      after: snapshot(result),
    });
  } catch {
    return internalError(
      'The change was applied by the flag system but could not be recorded in the audit log. Do not retry; check the flag system history.',
    );
  }

  return result;
}

/** Production writes need a reason and the flag key typed back, both checked server-side. */
function productionRequirementError(
  key: string,
  reason: string | undefined,
  confirmation: string | undefined,
): AppError | null {
  if (!reason || reason.trim() === '') {
    return validationError('A reason is required for production flag changes', {
      reason: 'Required for production',
    });
  }
  if (confirmation !== key) {
    return validationError('Type the exact flag key to confirm a production change', {
      confirmation: 'Does not match the flag key',
    });
  }
  return null;
}
