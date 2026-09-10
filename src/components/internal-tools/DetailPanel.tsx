interface Props {
  title: string;
  children: React.ReactNode;
}

export function DetailPanel({ title, children }: Props) {
  return (
    <section className="rounded border border-border-subtle bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
