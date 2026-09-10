import { eq } from 'drizzle-orm';

import type { AppDatabase } from '@/db/client';
import { auditEvents } from '@/db/schema';

import type { AuditEventInput, AuditEventRow, AuditSink } from '../types';

export function createAuditSink(db: AppDatabase): AuditSink {
  return {
    async emit(event: AuditEventInput): Promise<AuditEventRow> {
      const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const row = {
        id,
        occurredAt: new Date(),
        app: event.app,
        actorId: event.actorId,
        actorRole: event.actorRole,
        action: event.action,
        subjectType: event.subjectType,
        subjectRef: event.subjectRef,
        outcome: event.outcome,
        reason: event.reason ?? null,
        beforeJson: event.before ? JSON.stringify(event.before) : null,
        afterJson: event.after ? JSON.stringify(event.after) : null,
        requestId: event.requestId ?? null,
      } satisfies typeof auditEvents.$inferInsert;

      db.insert(auditEvents).values(row).run();

      return db.select().from(auditEvents).where(eq(auditEvents.id, id)).get()!;
    },

    listForSubject(subjectType: string, subjectRef: string): AuditEventRow[] {
      return db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.subjectType, subjectType))
        .all()
        .filter((row) => row.subjectRef === subjectRef)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    },
  };
}
