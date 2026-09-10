'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { SearchInput } from '@/components/internal-tools/SearchInput';

interface Props {
  initialQuery: string;
}

/**
 * Interactive leaf for the transaction search.
 *
 * Submitting navigates with `?q=`, so the server component re-runs the connector search.
 * The browser never fetches or filters payment data itself.
 */
export function TransactionSearch({ initialQuery }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        const target = query.trim() ? `/refunds?q=${encodeURIComponent(query.trim())}` : '/refunds';
        startTransition(() => router.push(target));
      }}
    >
      <div className="w-full sm:max-w-md">
        <SearchInput
          value={query}
          onChange={setQuery}
          label="Search transactions"
          placeholder="Customer, email domain, payment or customer reference"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pending ? 'Searching…' : 'Search'}
        </button>
        {initialQuery && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setQuery('');
              startTransition(() => router.push('/refunds'));
            }}
            className="rounded border border-border-subtle px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
