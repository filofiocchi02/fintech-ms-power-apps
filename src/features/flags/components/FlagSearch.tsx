'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SearchInput } from '@/components/internal-tools/SearchInput';
import type { FlagEnvironment } from '@/lib/integrations/types';

interface Props {
  environment: FlagEnvironment;
  query: string;
}

/**
 * Search by key or description. The query goes into the URL alongside the environment so a
 * filtered view is shareable and the server still does the filtering.
 */
export function FlagSearch({ environment, query }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(query);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams({ env: environment });
    if (value.trim()) params.set('q', value.trim());
    router.push(`/flags?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 items-center gap-2" role="search">
      <div className="min-w-48 flex-1">
        <SearchInput
          value={value}
          onChange={setValue}
          label="Search flags"
          placeholder="Search by key or description…"
        />
      </div>
      <button
        type="submit"
        className="rounded border border-border-subtle px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
      >
        Search
      </button>
    </form>
  );
}
