interface Item {
  label: string;
  value: React.ReactNode;
}

interface Props {
  items: Item[];
}

export function KeyValueList({ items }: Props) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-0.5 text-sm text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
