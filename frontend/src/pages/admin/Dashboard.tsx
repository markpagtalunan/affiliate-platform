import { Link } from 'react-router-dom';
import { Card, ErrorBox, Loading, PageHeader, Stat } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import { peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { AdminDashboard, Booking, BookingSource } from '../../types';

const SOURCES: { key: BookingSource; label: string }[] = [
  { key: 'b2c', label: 'B2C website' },
  { key: 'b2b', label: 'B2B / agents' },
  { key: 'affiliate', label: 'Affiliate' },
];

export default function Dashboard() {
  const d = useApi<AdminDashboard>('/admin/dashboard');
  const bk = useApi<{ items: Booking[] }>('/admin/bookings');
  if (d.loading || bk.loading) return <Loading />;
  if (d.error || !d.data) return <ErrorBox message={d.error ?? 'No data'} onRetry={d.reload} />;
  const s = d.data;

  // Prefer the server breakdown; otherwise derive from the bookings list for the current month.
  const derived = (k: BookingSource) => {
    const now = new Date();
    const list = (bk.data?.items ?? []).filter((b) => {
      const dt = new Date(b.createdAt);
      return b.source === k && b.status !== 'cancelled' && dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    });
    return { bookings: list.length, revenue: list.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.amount, 0) };
  };
  const bySource = (k: BookingSource) => s.bySource?.[k] ?? derived(k);

  return (
    <>
      <PageHeader title="Dashboard" sub="This month across all sales channels." />
      <div className="grid kpis">
        <Stat label="Bookings this month" value={s.bookingsThisMonth} />
        <Stat label="Revenue this month" value={peso(s.revenueThisMonth)} />
        <Stat label="Active affiliates" value={s.activeAffiliates} />
        <Stat label="Commission liability" value={peso(s.commissionLiability)} />
      </div>

      <Card title="Bookings and revenue by source (this month)">
        <div className="grid three">
          {SOURCES.map(({ key, label }) => {
            const v = bySource(key);
            return (
              <div className="source-tile" key={key}>
                <StatusBadge status={key} label={label} />
                <div className="stat-value">{v.bookings}</div>
                <div className="muted">bookings</div>
                <div className="source-rev">{peso(v.revenue)}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Needs action">
        <ul className="action-list">
          <li>
            <Link to="/admin/affiliates">{s.pendingAffiliates} affiliate application{s.pendingAffiliates === 1 ? '' : 's'} waiting for review</Link>
          </li>
          <li>
            <Link to="/admin/payouts">{s.pendingPayouts} payout request{s.pendingPayouts === 1 ? '' : 's'} to process</Link>
          </li>
        </ul>
      </Card>
    </>
  );
}
