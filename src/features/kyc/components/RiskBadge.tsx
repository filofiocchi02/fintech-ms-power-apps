import type { KycRiskLevel } from '@/lib/integrations/types';

const STYLES: Record<KycRiskLevel, string> = {
  low: 'bg-green-50 text-green-800 ring-green-600/20',
  medium: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  high: 'bg-red-50 text-red-800 ring-red-600/20',
};

/**
 * Provider risk level. The shared StatusBadge covers workflow statuses only, and risk is
 * provider evidence rather than app-owned state, so it is badged separately.
 */
export function RiskBadge({ risk }: { risk: KycRiskLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STYLES[risk]}`}
    >
      {risk} risk
    </span>
  );
}

export function FlagBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-600/20">
      {label}
    </span>
  );
}
