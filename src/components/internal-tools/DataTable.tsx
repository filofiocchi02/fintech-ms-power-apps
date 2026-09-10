interface Column<T> {
  header: string;
  /** Left, centre or right alignment. Money columns should be right-aligned. */
  align?: 'left' | 'right' | 'centre';
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
}

export function DataTable<T>({ columns, rows, rowKey, caption }: Props<T>) {
  return (
    <div className="overflow-x-auto rounded border border-border-subtle">
      <table className="w-full text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                scope="col"
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted ${alignClass(col.align)}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle bg-surface">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50/50">
              {columns.map((col) => (
                <td
                  key={col.header}
                  className={`px-4 py-2.5 ${alignClass(col.align)}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function alignClass(align: 'left' | 'right' | 'centre' | undefined): string {
  switch (align) {
    case 'right':
      return 'text-right';
    case 'centre':
      return 'text-center';
    default:
      return 'text-left';
  }
}
