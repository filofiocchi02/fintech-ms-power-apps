import type { AppError } from '@/lib/errors/errors';

interface Props {
  error?: AppError | { code: string; message: string } | null;
  title?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, title = 'Something went wrong', onRetry }: Props) {
  const message = error?.message ?? 'Please try again or contact support.';
  const code = error?.code ?? 'UNKNOWN';
  return (
    <div className="rounded border border-red-200 bg-red-50 px-4 py-6 text-red-900">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm">{message}</p>
      <p className="mt-2 text-xs uppercase tracking-wide text-red-700">Code: {code}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded bg-red-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
        >
          Retry
        </button>
      )}
    </div>
  );
}
