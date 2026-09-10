'use client';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search' }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="search" className="sr-only">
        {label}
      </label>
      <input
        id="search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-blue-600 focus:outline-none"
      />
    </div>
  );
}
