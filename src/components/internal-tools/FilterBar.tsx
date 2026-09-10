interface Props {
  children: React.ReactNode;
}

export function FilterBar({ children }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-border-subtle bg-surface p-3">
      {children}
    </div>
  );
}
