import { useId, useState } from 'react';
import { ChartShell, Legend, SrTable, TooltipBox, compact, niceMax, styleOf, useWidth } from './common';

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  /** 'right' draws against a secondary axis (e.g. bookings vs clicks). */
  axis?: 'left' | 'right';
  format?: (n: number) => string;
}

interface Props {
  labels: string[];
  series: LineSeries[];
  ariaLabel: string;
  format?: (n: number) => string;
  height?: number;
  integer?: boolean;
}

export function LineChart({ labels, series, ariaLabel, format = (n) => String(n), height = 260, integer }: Props) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId();
  const dual = series.some((s) => s.axis === 'right');
  const m = { l: 44, r: dual ? 40 : 12, t: 12, b: 28 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const n = labels.length;
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);

  const maxOf = (axis: 'left' | 'right') => {
    const raw = Math.max(0, ...series.filter((s) => (s.axis ?? 'left') === axis).flatMap((s) => s.values));
    return integer && raw <= 40 ? Math.max(4, Math.ceil(raw / 4) * 4) : niceMax(raw);
  };
  const maxL = maxOf('left');
  const maxR = maxOf('right');
  const y = (v: number, axis: 'left' | 'right') => m.t + ih - (v / (axis === 'right' ? maxR : maxL)) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelCount = width < 420 ? 3 : width < 700 ? 5 : 7;
  const labelIdx = new Set<number>();
  for (let k = 0; k < labelCount && n > 0; k++) labelIdx.add(Math.round((k / Math.max(1, labelCount - 1)) * (n - 1)));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round(((px - m.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="chart-wrap">
      <Legend items={series.map((s, i) => ({ label: s.label + (s.axis === 'right' ? ' (right axis)' : ''), index: i }))} />
      <ChartShell chartRef={ref} height={height}>
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove} style={{ touchAction: 'pan-y' }}>
          <title>{ariaLabel}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + iw} y1={m.t + ih - t * ih} y2={m.t + ih - t * ih} className="grid-line" />
              <text x={m.l - 6} y={m.t + ih - t * ih + 4} textAnchor="end" className="axis-text">{compact(t * maxL)}</text>
              {dual && <text x={m.l + iw + 6} y={m.t + ih - t * ih + 4} textAnchor="start" className="axis-text">{compact(t * maxR)}</text>}
            </g>
          ))}
          {labels.map((l, i) =>
            labelIdx.has(i) ? (
              <text key={`${uid}-${i}`} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="axis-text">{l}</text>
            ) : null,
          )}
          {series.map((s, si) => {
            const st = styleOf(si);
            const axis = s.axis ?? 'left';
            const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v, axis).toFixed(1)}`).join(' ');
            return <path key={s.key} d={d} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={st.dash || undefined} style={{ stroke: st.color }} />;
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} className="hover-line" />
              {series.map((s, si) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0, s.axis ?? 'left')} r="4.5" strokeWidth="2" style={{ stroke: styleOf(si).color, fill: 'var(--card)' }} />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && (
          <TooltipBox
            x={x(hover)}
            y={8}
            width={width}
            title={labels[hover] ?? ''}
            rows={series.map((s, si) => ({ label: s.label, value: (s.format ?? format)(s.values[hover] ?? 0), index: si }))}
          />
        )}
      </ChartShell>
      <SrTable caption={ariaLabel} labels={labels} series={series} format={format} />
    </div>
  );
}
