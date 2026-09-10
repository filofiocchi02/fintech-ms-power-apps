import Link from 'next/link';

import { DataTable } from '@/components/internal-tools/DataTable';
import { StatusBadge } from '@/components/internal-tools/StatusBadge';
import { demoUserName } from '@/lib/auth/users';

import type { KycQueueItem } from '../types';
import { FlagBadge, RiskBadge } from './RiskBadge';

/** Whole-hour age rendered the way a reviewer reads it: hours until a day, then days. */
export function formatAge(hours: number): string {
  if (hours < 1) return 'under 1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder === 0 ? `${days}d` : `${days}d ${remainder}h`;
}

export function QueueTable({ items }: { items: KycQueueItem[] }) {
  return (
    <DataTable
      caption="KYC review queue"
      rows={items}
      rowKey={(item) => item.id}
      columns={[
        {
          header: 'Customer',
          render: (item) => (
            <div>
              <Link
                href={`/kyc/${item.id}`}
                className="font-medium text-blue-800 underline-offset-2 hover:underline focus-visible:underline"
              >
                {item.customerName}
              </Link>
              <p className="text-xs text-muted">{item.customerRef}</p>
            </div>
          ),
        },
        { header: 'Country', render: (item) => item.country },
        { header: 'Status', render: (item) => <StatusBadge status={item.status} /> },
        {
          header: 'Risk',
          render: (item) => (
            <div className="flex flex-wrap items-center gap-1">
              <RiskBadge risk={item.riskLevel} />
              {item.hasSanctionsFlag && <FlagBadge label="Sanctions" />}
              {item.hasPepFlag && <FlagBadge label="PEP" />}
            </div>
          ),
        },
        {
          header: 'Assignee',
          render: (item) =>
            item.assigneeId ? (
              demoUserName(item.assigneeId)
            ) : (
              <span className="text-muted">Unassigned</span>
            ),
        },
        { header: 'Age', align: 'right', render: (item) => formatAge(item.ageHours) },
      ]}
    />
  );
}
