interface Props {
  enabled: boolean;
}

/**
 * Enabled / disabled badge, styled to match the shared `StatusBadge`. The shared component's
 * status union is frozen and has no flag states; adding `ENABLED` / `DISABLED` to it is the
 * shared change this branch avoids making and describes in the PR instead.
 */
export function FlagStateBadge({ enabled }: Props) {
  const style = enabled
    ? 'bg-green-50 text-green-800 ring-green-600/20'
    : 'bg-slate-100 text-slate-700 ring-slate-600/20';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style}`}>
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}
