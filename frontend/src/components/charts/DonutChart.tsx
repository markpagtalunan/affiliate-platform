import { Legend, SrTable, styleOf } from './common';

export interface Slice {
  label: string;
  value: number;
}

interface Props {
  slices: Slice[];
  ariaLabel: string;
  centerLabel: string;
  centerValue: string;
  format?: (n: number) => string;
}

export function DonutChart({ slices, ariaLabel, centerLabel, centerValue, format = (n) => String(n) }: Props) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = 62;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 180 180" className="donut" role="img" aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <circle cx="90" cy="90" r={r} fill="none" strokeWidth="26" className="donut-track" />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.value / total) * C;
            const dash = Math.max(0, len - gap);
            const el = (
              <circle key={s.label} cx="90" cy="90" r={r} fill="none" strokeWidth="26" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)" style={{ stroke: styleOf(i).color }}>
                <title>{`${s.label}: ${format(s.value)} (${Math.round((s.value / total) * 100)}%)`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        <text x="90" y="88" textAnchor="middle" className="donut-value">{centerValue}</text>
        <text x="90" y="108" textAnchor="middle" className="axis-text">{centerLabel}</text>
      </svg>
      <Legend items={slices.map((s, i) => ({ label: s.label, index: i, value: `${total ? Math.round((s.value / total) * 100) : 0}%` }))} />
      <SrTable caption={ariaLabel} labels={slices.map((s) => s.label)} series={[{ label: 'Value', values: slices.map((s) => s.value) }]} format={format} />
    </div>
  );
}
