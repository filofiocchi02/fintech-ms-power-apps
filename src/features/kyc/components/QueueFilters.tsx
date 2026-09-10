'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { FilterBar } from '@/components/internal-tools/FilterBar';
import { SearchInput } from '@/components/internal-tools/SearchInput';
import { KYC_WORKFLOW_STATUS } from '@/db/schema';

interface Props {
  countries: string[];
  assignees: string[];
}

const RISK_LEVELS = ['low', 'medium', 'high'] as const;

/**
 * Filters are held in the URL, not in component state, so the server re-runs the query and
 * a filtered queue can be linked to or reloaded. Filters combine.
 */
export function QueueFilters({ countries, assignees }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const urlSearch = params.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const [appliedSearch, setAppliedSearch] = useState(urlSearch);

  // The URL is the source of truth: when it changes under the box — Clear, back, a shared
  // link — the text follows it instead of showing a filter that is no longer applied.
  if (urlSearch !== appliedSearch) {
    setAppliedSearch(urlSearch);
    setSearch(urlSearch);
  }

  function apply(next: URLSearchParams) {
    startTransition(() => {
      const query = next.toString();
      router.push(query ? `/kyc?${query}` : '/kyc');
    });
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    apply(next);
  }

  return (
    <form
      className="mb-4"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        setParam('search', search.trim());
      }}
    >
      <FilterBar>
        <div className="min-w-56 flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            label="Search by customer"
            placeholder="Search customer name or reference…"
          />
        </div>

        <Select
          label="Status"
          name="status"
          value={params.get('status') ?? ''}
          options={KYC_WORKFLOW_STATUS.map((status) => ({ value: status, label: status.replace(/_/g, ' ') }))}
          onChange={(value) => setParam('status', value)}
        />
        <Select
          label="Risk"
          name="risk"
          value={params.get('risk') ?? ''}
          options={RISK_LEVELS.map((risk) => ({ value: risk, label: risk }))}
          onChange={(value) => setParam('risk', value)}
        />
        <Select
          label="Country"
          name="country"
          value={params.get('country') ?? ''}
          options={countries.map((country) => ({ value: country, label: country }))}
          onChange={(value) => setParam('country', value)}
        />
        <Select
          label="Assignee"
          name="assignee"
          value={params.get('assignee') ?? ''}
          options={[
            { value: 'unassigned', label: 'Unassigned' },
            ...assignees.map((assignee) => ({ value: assignee, label: assignee })),
          ]}
          onChange={(value) => setParam('assignee', value)}
        />

        <button type="submit" className="sr-only">
          Apply filters
        </button>
        <Link
          href="/kyc"
          className="rounded border border-border-subtle px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          Clear
        </Link>
        <span aria-live="polite" className="text-xs text-muted">
          {pending ? 'Filtering…' : ''}
        </span>
      </FilterBar>
    </form>
  );
}

interface SelectProps {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function Select({ label, name, value, options, onChange }: SelectProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`filter-${name}`} className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </label>
      <select
        id={`filter-${name}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded border border-border-subtle bg-surface px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
