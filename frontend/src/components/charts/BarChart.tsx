import { useId, useState } from 'react';
import { ChartShell, Legend, SrTable, TooltipBox, compact, niceMax, styleOf, useWidth } from './common';

export interface BarSeries {
  key: string;
  label: string;
  values: number[];
}

interface Props {
  labels: string[];
  series: BarSeries[];
  stacked?: boolean;
  ariaLabel: string;
  format?: (n: number) => string;
  height?: number;
  /** hide legend for single-series charts */
  hideLegend?: boolean;
  /** whole-number axis (counts) */
  integer?: boolean;
}

export function BarChart({ labels, series, stacked = false, ariaLabel, format = (n) => String(n), height = 260, hideLegend, integer }: Props) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  const m = { l: 44, r: 8, t: 12, b: 28 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const n = labels.length;
  const slot = iw / Math.max(1, n);
  const rawMax = stacked ? Math.max(0, ...labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0))) : Math.max(0, ...series.flatMap((s) => s.values));
  const maxVal = integer && rawMax <= 40 ? Math.max(4, Math.ceil(rawMax / 4) * 4) : niceMax(rawMax);
  const barW = Math.max(2, Math.min(44, stacked ? slot * 0.7 : (slot * 0.8) / series.length));
  const y = (v: number) => (v / maxVal) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const maxLabels = Math.max(2, Math.floor(iw / 56));
  const step = n <= 8 ? 1 : Math.ceil(n / maxLabels);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - m.l) / slot);
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div className="chart-wrap">
      {!hideLegend && <Legend items={series.map((s, i) => ({ label: s.label, index: i }))} />}
      <ChartShell chartRef={ref} height={height}>
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove} style={{ touchAction: 'pan-y' }}>
          <title>{ariaLabel}</title>
          <defs>
            <pattern id={`${uid}h1`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.5" height="6" fill="var(--card)" opacity="0.55" /></pattern>
            <pattern id={`${uid}h2`} width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.2" fill="var(--card)" opacity="0.7" /></pattern>
            <pattern id={`${uid}h3`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="1.5" height="6" fill="var(--card)" opacity="0.6" /></pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + iw} y1={m.t + ih - t * ih} y2={m.t + ih - t * ih} className="grid-line" />
              <text x={m.l - 6} y={m.t + ih - t * ih + 4} textAnchor="end" className="axis-text">{compact(t * maxVal)}</text>
            </g>
          ))}
          {hover !== null && <rect x={m.l + hover * slot} y={m.t} width={slot} height={ih} className="hover-band" />}
          {labels.map((l, i) => {
            const cx = m.l + i * slot + slot / 2;
            let acc = 0;
            return (
              <g key={`${l}-${i}`}>
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  const st = styleOf(si);
                  const h = Math.max(v > 0 ? 1 : 0, y(v));
                  const bw = Math.max(1, barW - (stacked ? 0 : 1));
                  const bx = stacked ? cx - barW / 2 : cx - (barW * series.length) / 2 + si * barW;
                  const by = stacked ? m.t + ih - y(acc) - h : m.t + ih - h;
                  acc += v;
                  return (
                    <g key={s.key}>
                      <rect x={bx} y={by} width={bw} height={h} rx="2" style={{ fill: st.color }} />
                      {st.hatch > 0 && <rect x={bx} y={by} width={bw} height={h} rx="2" fill={`url(#${uid}h${st.hatch})`} />}
                    </g>
                  );
                })}
                {i % step === 0 && <text x={cx} y={height - 8} textAnchor="middle" className="axis-text">{l}</text>}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <TooltipBox
            x={m.l + hover * slot + slot / 2}
            y={8}
            width={width}
            title={labels[hover] ?? ''}
            rows={[
              ...series.map((s, si) => ({ label: s.label, value: format(s.values[hover] ?? 0), index: si })),
              ...(stacked && series.length > 1 ? [{ label: 'Total', value: format(series.reduce((a, s) => a + (s.values[hover] ?? 0), 0)), index: 0 }] : []),
            ]}
          />
        )}
      </ChartShell>
      <SrTable caption={ariaLabel} labels={labels} series={series} format={format} />
    </div>
  );
}
