'use client';

import { useState } from 'react';

import type { FlagTargetingRule } from '../contracts';

interface Props {
  targeting: readonly FlagTargetingRule[];
  submitting: boolean;
  onApply: (targeting: FlagTargetingRule[]) => void;
}

const COHORT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_RULES = 10;

/**
 * Edits the cohort rules a flag targets. Rules are applied as a set: the operator edits the
 * whole list and applies it in one change, so the confirmation says exactly which cohorts
 * the flag will have afterwards, rather than describing a sequence of row edits.
 */
export function TargetingEditor({ targeting, submitting, onApply }: Props) {
  const [rules, setRules] = useState<FlagTargetingRule[]>(() =>
    targeting.map((rule) => ({ ...rule })),
  );

  function update(index: number, patch: Partial<FlagTargetingRule>) {
    setRules((current) =>
      current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );
  }

  const cohorts = rules.map((rule) => rule.cohort.trim().toLowerCase());
  const invalidCohort = rules.some((rule) => !COHORT_PATTERN.test(rule.cohort.trim()));
  const duplicateCohort = new Set(cohorts).size !== cohorts.length;
  const changed = JSON.stringify(rules.map(normalise)) !== JSON.stringify(targeting.map(normalise));
  const problem = invalidCohort
    ? 'Each cohort needs lowercase letters, numbers or hyphens.'
    : duplicateCohort
      ? 'Each cohort may appear only once.'
      : null;

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Targeting rules</p>

      {rules.length === 0 ? (
        <p className="text-sm text-muted">
          No cohort rules. The flag applies to all traffic within the rollout percentage.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule, index) => (
            <li key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                aria-label={`Cohort ${index + 1}`}
                value={rule.cohort}
                onChange={(event) => update(index, { cohort: event.target.value })}
                placeholder="cohort-name"
                className="w-full rounded sm:w-44 border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground focus:border-blue-600 focus:outline-none"
              />
              <input
                aria-label={`Cohort ${index + 1} description`}
                value={rule.description}
                onChange={(event) => update(index, { description: event.target.value })}
                placeholder="Who this covers"
                className="w-full min-w-0 rounded sm:flex-1 border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                className="self-start rounded border border-border-subtle px-2 py-1.5 text-sm text-foreground hover:bg-surface-muted sm:self-auto"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRules((current) => [...current, { cohort: '', description: '' }])}
          disabled={rules.length >= MAX_RULES}
          className="rounded border border-border-subtle px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
        >
          Add cohort
        </button>
        <button
          type="button"
          onClick={() => onApply(rules.map(normalise))}
          disabled={submitting || !changed || problem !== null}
          className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          Update targeting
        </button>
        {changed && (
          <button
            type="button"
            onClick={() => setRules(targeting.map((rule) => ({ ...rule })))}
            className="text-sm text-muted underline"
          >
            Discard edits
          </button>
        )}
        {problem && <p className="text-sm text-red-700">{problem}</p>}
      </div>
    </div>
  );
}

function normalise(rule: FlagTargetingRule): FlagTargetingRule {
  return { cohort: rule.cohort.trim(), description: rule.description.trim() };
}
