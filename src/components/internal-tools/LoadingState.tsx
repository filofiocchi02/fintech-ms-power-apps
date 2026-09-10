interface Props {
  message?: string;
}

export function LoadingState({ message = 'Loading…' }: Props) {
  return (
    <div className="flex items-center gap-3 rounded border border-border-subtle bg-surface px-4 py-8 text-muted">
      <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      <span>{message}</span>
    </div>
  );
}
