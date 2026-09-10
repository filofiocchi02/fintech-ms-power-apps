'use client';

import { ErrorState } from '@/components/internal-tools/ErrorState';

export default function FlagsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6">
      <ErrorState
        title="Feature flags are unavailable"
        error={{ code: 'INTERNAL', message: 'The flag system could not be reached.' }}
        onRetry={reset}
      />
    </div>
  );
}
