'use client';

import { ErrorState } from '@/components/internal-tools/ErrorState';

/**
 * Segment error boundary. Operators see a typed, safe message; the underlying error stays
 * on the server.
 */
export default function RefundsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Refund operations are unavailable"
      error={{ code: 'INTERNAL', message: 'The refunds tool could not load. Try again.' }}
      onRetry={reset}
    />
  );
}
