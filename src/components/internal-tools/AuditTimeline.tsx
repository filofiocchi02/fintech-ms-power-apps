import type { AuditEventRow } from '@/lib/repositories/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  events: AuditEventRow[];
}

export function AuditTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative border-s border-border-subtle pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative mb-5 ml-2">
          <div className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-muted" />
          <time className="mb-1 text-xs text-muted" dateTime={event.occurredAt.toISOString()}>
            {event.occurredAt.toLocaleString()}
          </time>
          <p className="text-sm font-medium text-foreground">
            {event.actorRole}: {event.action}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={event.outcome} />
            <span className="text-xs text-muted">{event.subjectType}/{event.subjectRef}</span>
          </div>
          {event.reason && <p className="mt-1 text-xs text-muted">{event.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
