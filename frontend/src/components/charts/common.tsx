import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** Series styling: colour (theme variable) plus a non-hue cue (dash pattern / hatch) so series differ by more than colour. */
export const SERIES_STYLES: { color: string; dash: string; hatch: number }[] = [
  { color: 'var(--primary)', dash: '', hatch: 0 },
  { color: 'var(--blue)', dash: '7 4', hatch: 1 },
  { color: 'var(--purple)', dash: '2 3', hatch: 2 },
  { color: 'var(--green)', dash: '9 3 2 3', hatch: 3 },
  { color: 'var(--amber)', dash: '1 4', hatch: 1 },
];

export const styleOf = (i: number) => SERIES_STYLES[i % SERIES_STYLES.length];

export function useWidth(): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(160, Math.floor(el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref as RefObject<HTMLDivElement>, w];
}

export const compact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n * 10) / 10);
};

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export interface LegendItem {
  label: string;
  index: number;
  value?: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="legend">
      {items.map((it) => {
        const st = styleOf(it.index);
        return (
          <li key={it.label}>
            <svg width="26" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="25" y2="5" strokeWidth="3" strokeLinecap="round" strokeDasharray={st.dash || undefined} style={{ stroke: st.color }} />
            </svg>
            <span>{it.label}</span>
            {it.value && <strong>{it.value}</strong>}
          </li>
        );
      })}
    </ul>
  );
}

export function TooltipBox({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: { label: string; value: string; index: number }[] }) {
  const flip = x > width * 0.6;
  return (
    <div className="chart-tip" style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: y }} role="presentation">
      <div className="chart-tip-title">{title}</div>
      {rows.map((r) => (
        <div className="chart-tip-row" key={r.label}>
          <i style={{ background: styleOf(r.index).color }} />
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** Visually hidden table so screen readers get the underlying numbers. */
export function SrTable({ caption, labels, series, format }: { caption: string; labels: string[]; series: { label: string; values: number[] }[]; format: (n: number) => string }) {
  return (
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>Period</th>
          {series.map((s) => (
            <th key={s.label}>{s.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((l, i) => (
          <tr key={`${l}-${i}`}>
            <th>{l}</th>
            {series.map((s) => (
              <td key={s.label}>{format(s.values[i] ?? 0)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

export function ChartShell({ children, height, chartRef }: { children: ReactNode; height?: number; chartRef: RefObject<HTMLDivElement> }) {
  return (
    <div className="chart" ref={chartRef} style={{ minHeight: height }}>
      {children}
    </div>
  );
}
