import { DetailPanel } from '@/components/internal-tools/DetailPanel';
import { StatusBadge } from '@/components/internal-tools/StatusBadge';

import type { KycCaseEvidence } from '../types';

const DOCUMENT_STYLES: Record<string, string> = {
  received: 'text-green-800',
  missing: 'text-red-800',
  expired: 'text-amber-800',
};

const CHECK_STYLES: Record<string, string> = {
  pass: 'text-green-800',
  fail: 'text-red-800',
  review: 'text-amber-800',
};

/**
 * Provider evidence, kept visually separate from app-owned workflow state so a reviewer can
 * always tell which system a fact came from.
 */
export function EvidencePanel({ evidence }: { evidence: KycCaseEvidence }) {
  return (
    <DetailPanel title="Provider evidence (KycProviderConnector)">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">Provider case {evidence.providerCaseRef}</span>
        <StatusBadge status={evidence.status} />
        <span className="text-muted">Submitted {evidence.submittedAt.toLocaleString()}</span>
      </div>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Documents</h3>
      <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle text-sm">
        {evidence.documents.map((document) => (
          <li key={document.kind} className="flex items-center justify-between gap-3 py-2">
            <span>
              {document.kind}
              {document.required && <span className="ml-2 text-xs text-muted">required</span>}
            </span>
            <span className={`font-medium ${DOCUMENT_STYLES[document.status] ?? ''}`}>{document.status}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Checks</h3>
      <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle text-sm">
        {evidence.checks.map((check) => (
          <li key={check.name} className="flex items-start justify-between gap-3 py-2">
            <span>
              {check.name}
              <span className="block text-xs text-muted">{check.detail}</span>
            </span>
            <span className={`font-medium ${CHECK_STYLES[check.outcome] ?? ''}`}>{check.outcome}</span>
          </li>
        ))}
      </ul>
    </DetailPanel>
  );
}
