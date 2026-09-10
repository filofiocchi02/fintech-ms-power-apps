/**
 * Status badge for workflow states. Text always accompanies colour so the meaning is not
 * colour-blind dependent. Structural placement and column order should encode status too;
 * this badge is a quick visual scan aid.
 */

type Status =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'AWAITING_INFO'
  | 'APPROVED'
  | 'REJECTED'
  | 'PENDING_APPROVAL'
  | 'EXECUTED'
  | 'ACCEPTED'
  | 'DENIED'
  | 'FAILED'
  | 'active'
  | 'suspended'
  | 'closed'
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'captured'
  | 'refunded'
  | 'disputed';

interface Props {
  status: Status;
}

const STYLES: Record<string, string> = {
  OPEN: 'bg-blue-50 text-blue-800 ring-blue-600/20',
  IN_REVIEW: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  AWAITING_INFO: 'bg-violet-50 text-violet-800 ring-violet-600/20',
  APPROVED: 'bg-green-50 text-green-800 ring-green-600/20',
  REJECTED: 'bg-red-50 text-red-800 ring-red-600/20',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  EXECUTED: 'bg-green-50 text-green-800 ring-green-600/20',
  ACCEPTED: 'bg-green-50 text-green-800 ring-green-600/20',
  DENIED: 'bg-red-50 text-red-800 ring-red-600/20',
  FAILED: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  active: 'bg-green-50 text-green-800 ring-green-600/20',
  suspended: 'bg-red-50 text-red-800 ring-red-600/20',
  closed: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  verified: 'bg-green-50 text-green-800 ring-green-600/20',
  pending: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  rejected: 'bg-red-50 text-red-800 ring-red-600/20',
  captured: 'bg-blue-50 text-blue-800 ring-blue-600/20',
  refunded: 'bg-green-50 text-green-800 ring-green-600/20',
  disputed: 'bg-red-50 text-red-800 ring-red-600/20',
};

export function StatusBadge({ status }: Props) {
  const style = STYLES[status] ?? 'bg-slate-100 text-slate-700 ring-slate-600/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
