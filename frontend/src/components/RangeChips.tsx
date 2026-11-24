import type { Range } from '../types';

const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '12m', label: '12 months' },
];

export function RangeChips({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="chips" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button key={r.id} className={`chip ${value === r.id ? 'on' : ''}`} aria-pressed={value === r.id} onClick={() => onChange(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}
