import { AuditTimeline } from '@/components/internal-tools/AuditTimeline';
import { DetailPanel } from '@/components/internal-tools/DetailPanel';
import { EnvironmentBadge } from '@/components/internal-tools/EnvironmentBadge';
import { KeyValueList } from '@/components/internal-tools/KeyValueList';
import type { Actor } from '@/lib/auth/session';

import type { FlagDetailView } from '../service';
import { canWriteEnvironment } from '../permissions';
import { FlagChangeForm } from './FlagChangeForm';
import { FlagStateBadge } from './FlagStateBadge';

interface Props {
  detail: FlagDetailView;
  actor: Actor;
}

export function FlagDetail({ detail, actor }: Props) {
  const { flag, connectorHistory, appAudit } = detail;

  return (
    <div className="flex flex-col gap-4">
      <DetailPanel title={`Flag — ${flag.key}`}>
        <KeyValueList
          items={[
            { label: 'Environment', value: <EnvironmentBadge environment={flag.environment} /> },
            { label: 'State', value: <FlagStateBadge enabled={flag.enabled} /> },
            { label: 'Rollout', value: `${flag.rolloutPercentage}%` },
            { label: 'Description', value: flag.description },
            { label: 'Last changed', value: flag.lastModifiedAt.toLocaleString() },
            { label: 'Last changed by', value: flag.lastModifiedBy },
          ]}
        />
      </DetailPanel>

      <DetailPanel title="Targeting">
        {flag.targeting.length === 0 ? (
          <p className="text-sm text-muted">
            No cohort rules. The flag applies to all traffic within the rollout percentage.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {flag.targeting.map((rule) => (
              <li key={rule.cohort}>
                <span className="font-medium text-foreground">{rule.cohort}</span>
                <span className="text-muted"> — {rule.description}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">
          Targeting rules are owned by the flag system and are read-only in this console.
        </p>
      </DetailPanel>

      <DetailPanel title="Change flag">
        <FlagChangeForm
          flagKey={flag.key}
          environment={flag.environment}
          enabled={flag.enabled}
          rolloutPercentage={flag.rolloutPercentage}
          canWrite={canWriteEnvironment(actor.role, flag.environment)}
        />
      </DetailPanel>

      <DetailPanel title="Flag system history">
        {connectorHistory.length === 0 ? (
          <p className="text-sm text-muted">The flag system has recorded no changes here yet.</p>
        ) : (
          <ol className="flex flex-col gap-3 text-sm">
            {connectorHistory.map((entry, index) => (
              <li key={`${entry.changedAt.toISOString()}-${index}`} className="border-b border-border-subtle pb-2 last:border-0">
                <p className="text-xs text-muted">{entry.changedAt.toLocaleString()}</p>
                <p className="font-medium text-foreground">
                  {entry.changeKind === 'enabled'
                    ? entry.enabled
                      ? 'Enabled'
                      : 'Disabled'
                    : `Rollout ${entry.rolloutPercentage}%`}{' '}
                  by {entry.actorId}
                </p>
                {entry.reason && <p className="text-xs text-muted">{entry.reason}</p>}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">
          Authoritative history from the flag system, including changes made outside this console.
        </p>
      </DetailPanel>

      <DetailPanel title="Internal-tool audit">
        <AuditTimeline events={appAudit} />
        <p className="mt-3 text-xs text-muted">
          What operators did in this console. Separate from the flag system&apos;s own history.
        </p>
      </DetailPanel>
    </div>
  );
}
