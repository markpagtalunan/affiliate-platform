import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { RangeChips } from '../../components/RangeChips';
import { SortableTable } from '../../components/SortableTable';
import { BarChart } from '../../components/charts/BarChart';
import { compact } from '../../components/charts/common';
import { DonutChart } from '../../components/charts/DonutChart';
import { KpiCard } from '../../components/charts/KpiCard';
import { LineChart } from '../../components/charts/LineChart';
import { StatusBadge } from '../../components/StatusBadge';
import { bucketLabel, downloadCsv } from '../../lib/csv';
import { peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { AdminAnalytics, BookingSource, Range } from '../../types';

const SRC: { key: BookingSource; label: string }[] = [
  { key: 'b2c', label: 'B2C' },
  { key: 'b2b', label: 'B2B' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'admin', label: 'Admin' },
];
const num = (n: number) => n.toLocaleString('en-PH');

export default function Analytics() {
  const [range, setRange] = useState<Range>('30d');
  const [metric, setMetric] = useState<'revenue' | 'bookings'>('revenue');
  const { data, error, loading, reload } = useApi<AdminAnalytics>(`/admin/analytics?range=${range}`);

  const exportCsv = () => {
    if (!data) return;
    const rows: (string | number)[][] = [['affiliate', 'code', 'tier', 'clicks', 'bookings', 'conversion_pct', 'revenue_php', 'commission_php']];
    data.topAffiliates.forEach((a) => rows.push([a.name, a.code, a.tier, a.clicks, a.bookings, a.conversionPct, a.revenue, a.commission]));
    rows.push([], ['date', 'revenue_b2c', 'revenue_b2b', 'revenue_affiliate', 'revenue_admin', 'bookings_b2c', 'bookings_b2b', 'bookings_affiliate', 'bookings_admin']);
    data.series.forEach((s, i) => {
      const b = data.bookingsSeries[i];
      rows.push([s.date, s.b2c, s.b2b, s.affiliate, s.admin, b?.b2c ?? 0, b?.b2b ?? 0, b?.affiliate ?? 0, b?.admin ?? 0]);
    });
    downloadCsv(`admin-analytics-${range}.csv`, rows);
  };

  const header = (
    <div className="analytics-bar">
      <RangeChips value={range} onChange={setRange} />
      <button className="btn small" disabled={!data} onClick={exportCsv}>
        Export CSV
      </button>
    </div>
  );

  if (loading && !data) return (<><PageHeader title="Analytics" sub="Sales, affiliates and payouts." />{header}<Loading /></>);
  if (error || !data) return (<><PageHeader title="Analytics" sub="Sales, affiliates and payouts." />{header}<ErrorBox message={error ?? 'No data'} onRetry={reload} /></>);

  const { kpis, previous } = data;
  const labels = data.series.map((s) => bucketLabel(s.date, range));
  const source = metric === 'revenue' ? data.series : data.bookingsSeries;
  const fmt = metric === 'revenue' ? peso : num;
  const split = data.bySource.map((s) => ({ label: SRC.find((x) => x.key === s.source)?.label ?? s.source, value: metric === 'revenue' ? s.revenue : s.bookings }));
  const splitTotal = split.reduce((a, s) => a + s.value, 0);
  const maxTier = Math.max(1, ...data.tierDistribution.map((t) => t.count));
  const outstanding = Math.max(0, data.payouts.liability);

  return (
    <>
      <PageHeader title="Analytics" sub="Sales, affiliates and payouts, compared with the previous period." />
      {header}

      <div className="grid kpi-row">
        <KpiCard label="Revenue" value={peso(kpis.revenue)} cur={kpis.revenue} prev={previous.revenue} spark={data.series.map((s) => s.b2c + s.b2b + s.affiliate + s.admin)} />
        <KpiCard label="Bookings" value={num(kpis.bookings)} cur={kpis.bookings} prev={previous.bookings} spark={data.bookingsSeries.map((s) => s.b2c + s.b2b + s.affiliate + s.admin)} />
        <KpiCard label="Affiliate conversion" value={`${kpis.conversionPct}%`} cur={kpis.conversionPct} prev={previous.conversionPct} />
        <KpiCard label="Active affiliates" value={num(kpis.activeAffiliates)} cur={kpis.activeAffiliates} prev={previous.activeAffiliates} />
        <KpiCard label="New affiliates" value={num(kpis.newAffiliates)} cur={kpis.newAffiliates} prev={previous.newAffiliates} />
        <KpiCard label="Affiliate share" value={`${kpis.affiliateSharePct}%`} cur={kpis.affiliateSharePct} prev={previous.affiliateSharePct} hint="of bookings" />
        <KpiCard label="Commission accrued" value={peso(kpis.commissionAccrued)} cur={kpis.commissionAccrued} prev={previous.commissionAccrued} />
        <KpiCard label="Commission paid" value={peso(kpis.commissionPaid)} cur={kpis.commissionPaid} prev={previous.commissionPaid} />
      </div>

      <div className="grid split">
        <Card
          title={metric === 'revenue' ? 'Revenue by source' : 'Bookings by source'}
          action={
            <div className="chips" style={{ margin: 0 }}>
              <button className={`chip ${metric === 'revenue' ? 'on' : ''}`} onClick={() => setMetric('revenue')}>Revenue</button>
              <button className={`chip ${metric === 'bookings' ? 'on' : ''}`} onClick={() => setMetric('bookings')}>Bookings</button>
            </div>
          }
        >
          <BarChart
            stacked
            labels={labels}
            format={fmt}
            ariaLabel={`${metric === 'revenue' ? 'Revenue' : 'Bookings'} by source per ${range === '12m' ? 'month' : 'day'}, stacked: ${data.bySource.map((s) => `${s.source} ${fmt(metric === 'revenue' ? s.revenue : s.bookings)}`).join(', ')}`}
            series={SRC.map((s) => ({ key: s.key, label: s.label, values: source.map((p) => p[s.key]) }))}
          />
        </Card>
        <Card title="Source split">
          <DonutChart
            slices={split}
            centerValue={(metric === 'revenue' ? '₱' : '') + compact(splitTotal)}
            centerLabel={metric === 'revenue' ? 'revenue' : 'bookings'}
            format={fmt}
            ariaLabel={`Source split by ${metric}: ${split.map((s) => `${s.label} ${fmt(s.value)}`).join(', ')}`}
          />
        </Card>
      </div>

      <Card title="Top affiliates" action={<Link to="/admin/affiliates">Manage affiliates</Link>}>
        <SortableTable
          rows={data.topAffiliates}
          rowKey={(r) => r.uid}
          initial={{ col: 4, dir: 'desc' }}
          empty="No affiliate activity in this period."
          columns={[
            { header: 'Affiliate', render: (r) => <><Link to="/admin/affiliates"><strong>{r.name}</strong></Link> <code>{r.code}</code></>, sort: (r) => r.name },
            { header: 'Tier', render: (r) => r.tier, sort: (r) => r.tier },
            { header: 'Clicks', align: 'right', render: (r) => num(r.clicks), sort: (r) => r.clicks },
            { header: 'Bookings', align: 'right', render: (r) => num(r.bookings), sort: (r) => r.bookings },
            { header: 'Revenue', align: 'right', render: (r) => peso(r.revenue), sort: (r) => r.revenue },
            { header: 'Commission', align: 'right', render: (r) => peso(r.commission), sort: (r) => r.commission },
            { header: 'Conv.', align: 'right', render: (r) => `${r.conversionPct}%`, sort: (r) => r.conversionPct },
          ]}
        />
      </Card>

      <Card title="Top packages">
        <SortableTable
          rows={data.topPackages}
          rowKey={(r) => r.packageId}
          initial={{ col: 2, dir: 'desc' }}
          columns={[
            { header: 'Package', render: (r) => r.name, sort: (r) => r.name },
            { header: 'Bookings', align: 'right', render: (r) => num(r.bookings), sort: (r) => r.bookings },
            { header: 'Revenue', align: 'right', render: (r) => peso(r.revenue), sort: (r) => r.revenue },
            { header: 'Affiliate bookings', align: 'right', render: (r) => num(r.affiliateBookings), sort: (r) => r.affiliateBookings },
            {
              header: 'Affiliate share',
              align: 'right',
              render: (r) => <StatusBadge status="affiliate" label={`${r.bookings ? Math.round((r.affiliateBookings / r.bookings) * 100) : 0}%`} />,
              sort: (r) => (r.bookings ? r.affiliateBookings / r.bookings : 0),
            },
          ]}
        />
      </Card>

      <div className="grid split-even">
        <Card title="Affiliate growth">
          <LineChart
            labels={data.affiliateGrowth.map((g) => bucketLabel(g.date, range))}
            height={220}
            integer
            ariaLabel={`Total affiliates over time, now ${data.affiliateGrowth[data.affiliateGrowth.length - 1]?.total ?? 0}`}
            series={[{ key: 'total', label: 'Total affiliates', values: data.affiliateGrowth.map((g) => g.total) }]}
          />
        </Card>
        <Card title="Tier distribution">
          <BarChart
            hideLegend
            integer
            height={220}
            labels={data.tierDistribution.map((t) => t.tier)}
            series={[{ key: 'count', label: 'Affiliates', values: data.tierDistribution.map((t) => t.count) }]}
            ariaLabel={`Active affiliates by tier: ${data.tierDistribution.map((t) => `${t.tier} ${t.count}`).join(', ')}`}
          />
          <p className="muted">Most common tier has {maxTier} active affiliate{maxTier === 1 ? '' : 's'}.</p>
        </Card>
      </div>

      <Card title="Payout liability">
        <div className="mini-stats">
          <div><strong>{peso(data.payouts.requestedAmount)}</strong><span>Requested, awaiting payment</span></div>
          <div><strong>{peso(data.payouts.paidAmount)}</strong><span>Paid to date</span></div>
          <div><strong>{peso(outstanding)}</strong><span>Outstanding liability</span></div>
        </div>
        <p><Link to="/admin/payouts">Go to payouts</Link></p>
      </Card>
    </>
  );
}
