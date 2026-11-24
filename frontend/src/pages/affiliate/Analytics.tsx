import { useState } from 'react';
import { Card, Empty, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { RangeChips } from '../../components/RangeChips';
import { SortableTable } from '../../components/SortableTable';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { KpiCard } from '../../components/charts/KpiCard';
import { LineChart } from '../../components/charts/LineChart';
import { bucketLabel, downloadCsv } from '../../lib/csv';
import { peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { AffiliateAnalytics, Range } from '../../types';

const CHANNEL_LABEL: Record<string, string> = { facebook: 'Facebook', messenger: 'Messenger', whatsapp: 'WhatsApp', direct: 'Direct', other: 'Other' };
const STATUS_ORDER = ['pending', 'payable', 'requested', 'paid', 'reversed'] as const;
const num = (n: number) => n.toLocaleString('en-PH');

/** 7-point trailing average, used to keep sparse daily counts readable. */
const smooth = (v: number[]): number[] => v.map((_, i) => { const w = v.slice(Math.max(0, i - 6), i + 1); return Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10; });

export default function Analytics() {
  const [range, setRange] = useState<Range>('30d');
  const [trend, setTrend] = useState<'traffic' | 'earnings'>('traffic');
  const { data, error, loading, reload } = useApi<AffiliateAnalytics>(`/analytics/overview?range=${range}`);

  const exportCsv = () => {
    if (!data) return;
    const rows: (string | number)[][] = [['date', 'clicks', 'bookings', 'earned_php']];
    data.series.forEach((s) => rows.push([s.date, s.clicks, s.bookings, s.earned]));
    rows.push([], ['package', 'clicks', 'bookings', 'conversion_pct', 'earned_php']);
    data.byPackage.forEach((p) => rows.push([p.name, p.clicks, p.bookings, p.conversionPct, p.earned]));
    downloadCsv(`affiliate-analytics-${range}.csv`, rows);
  };

  const header = (
    <div className="analytics-bar">
      <RangeChips value={range} onChange={setRange} />
      <button className="btn small" disabled={!data} onClick={exportCsv}>
        Export CSV
      </button>
    </div>
  );

  if (loading && !data) return (<><PageHeader title="Analytics" sub="How your links perform." />{header}<Loading /></>);
  if (error || !data) return (<><PageHeader title="Analytics" sub="How your links perform." />{header}<ErrorBox message={error ?? 'No data'} onRetry={reload} /></>);

  const { kpis, previous, series } = data;
  const labels = series.map((s) => bucketLabel(s.date, range));
  const empty = kpis.clicks === 0 && kpis.bookings === 0 && previous.clicks === 0;
  const next = data.tier.nextTier;
  const tierPct = next ? Math.min(100, Math.round((data.tier.bookingsThisQuarter / Math.max(1, next.minBookings)) * 100)) : 100;
  const f = data.funnel;
  const stages = [
    { label: 'Clicks', value: f.clicks, of: f.clicks },
    { label: 'Started booking', value: f.startedBooking, of: f.clicks },
    { label: 'Paid bookings', value: f.paid, of: f.startedBooking },
  ];
  const channelTotal = data.byChannel.reduce((a, c) => a + c.clicks, 0);

  return (
    <>
      <PageHeader title="Analytics" sub="How your links perform, compared with the previous period." />
      {header}
      {empty ? (
        <Card>
          <Empty text="No activity yet. Share your referral links to start seeing clicks, bookings and earnings here." />
        </Card>
      ) : (
        <>
          <div className="grid kpi-row">
            <KpiCard label="Clicks" value={num(kpis.clicks)} cur={kpis.clicks} prev={previous.clicks} spark={series.map((s) => s.clicks)} />
            <KpiCard label="Bookings" value={num(kpis.bookings)} cur={kpis.bookings} prev={previous.bookings} spark={series.map((s) => s.bookings)} />
            <KpiCard label="Conversion" value={`${kpis.conversionPct}%`} cur={kpis.conversionPct} prev={previous.conversionPct} />
            <KpiCard label="Earned" value={peso(kpis.earned)} cur={kpis.earned} prev={previous.earned} spark={series.map((s) => s.earned)} />
            <KpiCard label="Avg booking value" value={peso(kpis.avgBookingValue)} cur={kpis.avgBookingValue} prev={previous.avgBookingValue} />
          </div>

          <Card
            title="Trend"
            action={
              <div className="chips" style={{ margin: 0 }}>
                <button className={`chip ${trend === 'traffic' ? 'on' : ''}`} onClick={() => setTrend('traffic')}>Clicks vs bookings</button>
                <button className={`chip ${trend === 'earnings' ? 'on' : ''}`} onClick={() => setTrend('earnings')}>Earnings</button>
              </div>
            }
          >
            {trend === 'traffic' ? (
              <LineChart
                labels={labels}
                ariaLabel={`Clicks and bookings per ${range === '12m' ? 'month' : 'day'}: ${num(kpis.clicks)} clicks and ${num(kpis.bookings)} bookings in total`}
                series={[
                  { key: 'clicks', label: range === '12m' ? 'Clicks' : 'Clicks (7-day avg)', values: range === '12m' ? series.map((s) => s.clicks) : smooth(series.map((s) => s.clicks)) },
                  { key: 'bookings', label: range === '12m' ? 'Bookings' : 'Bookings (7-day avg)', values: range === '12m' ? series.map((s) => s.bookings) : smooth(series.map((s) => s.bookings)), axis: 'right' },
                ]}
              />
            ) : (
              <LineChart
                labels={labels}
                ariaLabel={`Earnings per ${range === '12m' ? 'month' : 'day'}: ${peso(kpis.earned)} in total`}
                format={peso}
                series={[{ key: 'earned', label: 'Earned', values: series.map((s) => s.earned) }]}
              />
            )}
          </Card>

          <div className="grid split-even">
            <Card title="Funnel">
              <div className="stage-list">
                {stages.map((s, i) => (
                  <div key={s.label}>
                    <div className="stage-top">
                      <span>{s.label}</span>
                      <strong>
                        {num(s.value)} {i > 0 && <span className="muted">({s.of ? Math.round((s.value / s.of) * 100) : 0}% of {stages[i - 1].label.toLowerCase()})</span>}
                      </strong>
                    </div>
                    <div className="track">
                      <div className={`fill ${i === 2 ? 'accent' : ''}`} style={{ width: `${f.clicks ? Math.max(1.5, (s.value / f.clicks) * 100) : 0}%`, opacity: i === 1 ? 0.7 : 1 }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Commission by status">
              <BarChart
                labels={STATUS_ORDER.map((s) => s.charAt(0).toUpperCase() + s.slice(1))}
                series={[{ key: 'amount', label: 'Commission', values: STATUS_ORDER.map((s) => data.commissionByStatus[s]) }]}
                hideLegend
                format={peso}
                height={220}
                ariaLabel={`Commission by status: ${STATUS_ORDER.map((s) => `${s} ${peso(data.commissionByStatus[s])}`).join(', ')}`}
              />
            </Card>
          </div>

          <div className="grid split">
            <Card title="Top packages">
              <SortableTable
                rows={data.byPackage}
                rowKey={(r) => r.packageId}
                initial={{ col: 4, dir: 'desc' }}
                columns={[
                  { header: 'Package', render: (r) => r.name, sort: (r) => r.name },
                  { header: 'Clicks', align: 'right', render: (r) => num(r.clicks), sort: (r) => r.clicks },
                  { header: 'Bookings', align: 'right', render: (r) => num(r.bookings), sort: (r) => r.bookings },
                  { header: 'Conv.', align: 'right', render: (r) => `${r.conversionPct}%`, sort: (r) => r.conversionPct },
                  { header: 'Earned', align: 'right', render: (r) => peso(r.earned), sort: (r) => r.earned },
                ]}
              />
            </Card>
            <Card title="Traffic by channel">
              <DonutChart
                slices={data.byChannel.map((c) => ({ label: CHANNEL_LABEL[c.channel] ?? c.channel, value: c.clicks }))}
                centerValue={num(channelTotal)}
                centerLabel="clicks"
                format={num}
                ariaLabel={`Clicks by channel: ${data.byChannel.map((c) => `${CHANNEL_LABEL[c.channel]} ${c.clicks}`).join(', ')}`}
              />
              <SortableTable
                rows={data.byChannel}
                rowKey={(r) => r.channel}
                columns={[
                  { header: 'Channel', render: (r) => CHANNEL_LABEL[r.channel] ?? r.channel, sort: (r) => r.channel },
                  { header: 'Clicks', align: 'right', render: (r) => num(r.clicks), sort: (r) => r.clicks },
                  { header: 'Bookings', align: 'right', render: (r) => num(r.bookings), sort: (r) => r.bookings },
                ]}
              />
            </Card>
          </div>
        </>
      )}

      <Card title="Tier progress">
        <p>
          <strong>{data.tier.name}</strong> - {data.tier.rate}% commission - {data.tier.bookingsThisQuarter} bookings this quarter
        </p>
        <div className="track big"><div className="fill" style={{ width: `${tierPct}%` }} /></div>
        <p className="muted">
          {next ? `${Math.max(0, next.minBookings - data.tier.bookingsThisQuarter)} more bookings to reach ${next.name} (${next.rate}%)` : 'You are at the top tier.'}
        </p>
      </Card>
    </>
  );
}
