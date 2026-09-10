interface Props {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  title = 'Nothing here',
  description = 'There are no items to display.',
  action,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-border-subtle bg-surface px-6 py-12 text-center">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
