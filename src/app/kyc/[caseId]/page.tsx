import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AccessDenied } from '@/components/internal-tools/AccessDenied';
import { AppShell } from '@/components/internal-tools/AppShell';
import { AuditTimeline } from '@/components/internal-tools/AuditTimeline';
import { DetailPanel } from '@/components/internal-tools/DetailPanel';
import { KeyValueList } from '@/components/internal-tools/KeyValueList';
import { PageHeader } from '@/components/internal-tools/PageHeader';
import { StatusBadge } from '@/components/internal-tools/StatusBadge';
import { DecisionPanel } from '@/features/kyc/components/DecisionPanel';
import { EvidencePanel } from '@/features/kyc/components/EvidencePanel';
import { formatAge } from '@/features/kyc/components/QueueTable';
import { FlagBadge, RiskBadge } from '@/features/kyc/components/RiskBadge';
import { canOverrideSanctions, canReviewKyc } from '@/features/kyc/authorization';
import { kycDeps } from '@/features/kyc/deps';
import { getCaseDetail, outstandingDocuments, requiresSanctionsOverride } from '@/features/kyc/service';
import { requireAppAccessOrDenied } from '@/lib/auth/guards';
import { isAppError } from '@/lib/errors/errors';

interface Props {
  params: Promise<{ caseId: string }>;
}

export default async function KycCasePage({ params }: Props) {
  const guard = await requireAppAccessOrDenied('kyc');
  if (guard.denied) {
    if (guard.reason.actor) {
      redirect('/');
    }
    return (
      <AppShell>
        <AccessDenied actor={null} requiredApp="KYC" />
      </AppShell>
    );
  }

  const { caseId } = await params;
  const detail = getCaseDetail(kycDeps(), guard.actor, caseId);
  if (isAppError(detail)) notFound();

  const { workflow, evidence, customer, queueItem, audit } = detail;
  const outstanding = outstandingDocuments(evidence);
  const needsOverride = requiresSanctionsOverride(evidence);
  const decided = workflow.status === 'APPROVED' || workflow.status === 'REJECTED';

  const approvalBlockedReason =
    outstanding.length > 0
      ? `required documents outstanding (${outstanding.join(', ')})`
      : needsOverride && !canOverrideSanctions(guard.actor.role)
        ? 'a sanctions or PEP hit needs a Manager / Admin override'
        : null;

  return (
    <AppShell activeApp="kyc">
      <PageHeader
        title={customer.displayName}
        description={evidence.referralReason}
        actions={
          <Link href="/kyc" className="rounded border border-border-subtle px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
            Back to queue
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <DetailPanel title="Customer (CustomerConnector)">
            <KeyValueList
              items={[
                { label: 'Customer', value: customer.displayName },
                { label: 'Reference', value: customer.ref },
                { label: 'Country', value: customer.region },
                { label: 'Email domain', value: customer.emailDomain },
                { label: 'Account status', value: <StatusBadge status={customer.accountStatus} /> },
              ]}
            />
          </DetailPanel>

          <EvidencePanel evidence={evidence} />

          <DetailPanel title="Case activity (app audit)">
            <AuditTimeline events={audit} />
          </DetailPanel>
        </div>

        <div className="space-y-4">
          <DetailPanel title="Review workflow (app-owned)">
            <KeyValueList
              items={[
                { label: 'Workflow status', value: <StatusBadge status={workflow.status} /> },
                { label: 'Assignee', value: workflow.assigneeId ?? 'Unassigned' },
                { label: 'Age', value: formatAge(queueItem.ageHours) },
                { label: 'Opened', value: workflow.openedAt.toLocaleString() },
                { label: 'Decided by', value: workflow.decidedBy ?? '—' },
                { label: 'Decision reason', value: workflow.decisionReason ?? '—' },
              ]}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <RiskBadge risk={evidence.riskLevel} />
              {evidence.hasSanctionsFlag && <FlagBadge label="Sanctions hit" />}
              {evidence.hasPepFlag && <FlagBadge label="PEP hit" />}
            </div>
          </DetailPanel>

          <DetailPanel title="Decision">
            <DecisionPanel
              caseId={workflow.id}
              version={workflow.version}
              decided={decided}
              canDecide={canReviewKyc(guard.actor.role)}
              approvalBlockedReason={approvalBlockedReason}
            />
          </DetailPanel>
        </div>
      </div>
    </AppShell>
  );
}
