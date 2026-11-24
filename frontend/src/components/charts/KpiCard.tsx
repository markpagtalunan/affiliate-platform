import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

/** Percentage change vs previous period; null when there is no baseline. */
export function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return cur > 0 ? null : 0;
  return ((cur - prev) / prev) * 100;
}

export function DeltaBadge({ cur, prev }: { cur: number; prev: number }) {
  const d = deltaPct(cur, prev);
  if (d === null) return <span className="delta flat" aria-label="New, no previous data">New</span>;
  const rounded = Math.round(Math.abs(d) * 10) / 10;
  if (rounded === 0) return <span className="delta flat" aria-label="No change vs previous period">0%</span>;
  const up = d > 0;
  return (
    <span className={`delta ${up ? 'up' : 'down'}`} aria-label={`${up ? 'Up' : 'Down'} ${rounded}% vs previous period`}>
      {up ? '▲' : '▼'} {rounded}%
    </span>
  );
}

interface Props {
  label: string;
  value: ReactNode;
  cur?: number;
  prev?: number;
  spark?: number[];
  hint?: string;
}

export function KpiCard({ label, value, cur, prev, spark, hint }: Props) {
  return (
    <div className="card stat kpi">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="kpi-foot">
        {cur !== undefined && prev !== undefined && <DeltaBadge cur={cur} prev={prev} />}
        {hint && <span className="stat-hint">{hint}</span>}
        {spark && <Sparkline values={spark} />}
      </div>
    </div>
  );
}
