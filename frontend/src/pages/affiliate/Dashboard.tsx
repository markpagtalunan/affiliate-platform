import { Card, Empty, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { KpiCard } from '../../components/charts/KpiCard';
import { StatusBadge } from '../../components/StatusBadge';
import { Table } from '../../components/Table';
import { fmtDate, peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { AffiliateAnalytics, AffiliateDashboard } from '../../types';

export default function Dashboard() {
  const { data, error, loading, reload } = useApi<AffiliateDashboard>('/dashboard');
  const ov = useApi<AffiliateAnalytics>('/analytics/overview?range=30d').data; // optional: adds trend sparklines and deltas
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'No data'} onRetry={reload} />;

  const maxBar = Math.max(1, ...data.bars.map((b) => b.value));
  const maxFunnel = Math.max(1, data.funnel.clicks);
  const next = data.tier.nextTier;
  const pct = next ? Math.min(100, Math.round((data.tier.bookingsThisQuarter / Math.max(1, next.minBookings)) * 100)) : 100;

  return (
    <>
      <PageHeader title="Dashboard" sub="Your performance at a glance." />
      <div className="grid kpis">
        <KpiCard label="Clicks (30d)" value={data.clicks30d.toLocaleString()} cur={ov?.kpis.clicks} prev={ov?.previous.clicks} spark={ov?.series.map((x) => x.clicks)} />
        <KpiCard label="Bookings (30d)" value={data.bookings30d} cur={ov?.kpis.bookings} prev={ov?.previous.bookings} spark={ov?.series.map((x) => x.bookings)} />
        <KpiCard label="Conversion" value={`${data.conversionPct}%`} cur={ov?.kpis.conversionPct} prev={ov?.previous.conversionPct} />
        <KpiCard label="Earned this month" value={peso(data.earnedThisMonth)} cur={ov?.kpis.earned} prev={ov?.previous.earned} spark={ov?.series.map((x) => x.earned)} />
      </div>

      <div className="grid two">
        <Card title="Commission, last 6 months">
          <div className="bars" role="img" aria-label="Commission per month">
            {data.bars.map((b) => (
              <div className="bar-col" key={b.month}>
                <span className="bar-val">{b.value ? peso(b.value) : ''}</span>
                <div className="bar" style={{ height: `${Math.max(2, (b.value / maxBar) * 100)}%` }} />
                <span className="bar-label">{b.month}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Funnel (30d)">
          <div className="funnel">
            <div>
              <div className="funnel-row"><span>Clicks</span><strong>{data.funnel.clicks}</strong></div>
              <div className="track"><div className="fill" style={{ width: '100%' }} /></div>
            </div>
            <div>
              <div className="funnel-row"><span>Bookings</span><strong>{data.funnel.bookings}</strong></div>
              <div className="track"><div className="fill accent" style={{ width: `${(data.funnel.bookings / maxFunnel) * 100}%` }} /></div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Tier progress">
        <p>
          <strong>{data.tier.name}</strong> - {data.tier.rate}% commission - {data.tier.bookingsThisQuarter} bookings this quarter
        </p>
        <div className="track big"><div className="fill" style={{ width: `${pct}%` }} /></div>
        <p className="muted">
          {next ? `${Math.max(0, next.minBookings - data.tier.bookingsThisQuarter)} more bookings to reach ${next.name} (${next.rate}%)` : 'You are at the top tier.'}
        </p>
      </Card>

      <Card title="Recent commissions">
        {data.recent.length === 0 ? (
          <Empty text="No commissions yet. Share your links to get started." />
        ) : (
          <Table
            rows={data.recent}
            rowKey={(r) => r.ref}
            columns={[
              { header: 'Ref', render: (r) => r.ref },
              { header: 'Package', render: (r) => r.packageName },
              { header: 'Date', render: (r) => fmtDate(r.createdAt) },
              { header: 'Commission', align: 'right', render: (r) => peso(r.commission) },
              { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
