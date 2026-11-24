import { useState } from 'react';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import { Table } from '../../components/Table';
import { fmtDate, peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Booking, BookingSource } from '../../types';

const SOURCES: { key: 'all' | BookingSource; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'b2c', label: 'B2C' },
  { key: 'b2b', label: 'B2B' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'admin', label: 'Admin' },
];
const STATUSES = ['all', 'pending', 'confirmed', 'cancelled'] as const;

export default function Bookings() {
  const [source, setSource] = useState<'all' | BookingSource>('all');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  // Fetch every source for the chosen status so the per-source summary stays complete; filter by source client-side.
  const { data, error, loading, reload } = useApi<{ items: Booking[] }>(`/admin/bookings${status === 'all' ? '' : `?status=${status}`}`);

  const items = data?.items ?? [];
  const summary = (k: BookingSource) => {
    const list = items.filter((b) => b.source === k);
    return { count: list.length, revenue: list.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.amount, 0) };
  };
  const rows = source === 'all' ? items : items.filter((b) => b.source === source);

  return (
    <>
      <PageHeader title="Bookings" sub="All bookings from the B2C site, B2B portal, affiliate links and back office." />

      {data && (
        <div className="grid kpis">
          {SOURCES.filter((s) => s.key !== 'all').map((s) => {
            const v = summary(s.key as BookingSource);
            return (
              <div className="card stat" key={s.key}>
                <div className="stat-label"><StatusBadge status={s.key} label={s.label} /></div>
                <div className="stat-value">{v.count}</div>
                <div className="stat-hint">{peso(v.revenue)} confirmed revenue</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="filters">
        <div className="chips">
          {SOURCES.map((s) => (
            <button key={s.key} className={`chip ${source === s.key ? 'on' : ''}`} onClick={() => setSource(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="chips">
          {STATUSES.map((s) => (
            <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
              {s === 'all' ? 'Any status' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {loading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorBox message={error ?? 'No data'} onRetry={reload} />
        ) : (
          <Table
            rows={rows}
            rowKey={(r) => r.ref}
            empty="No bookings match these filters."
            columns={[
              { header: 'Ref', render: (r) => r.ref },
              { header: 'Customer', render: (r) => r.customerName },
              { header: 'Package', render: (r) => r.packageName },
              {
                header: 'Source',
                render: (r) => (
                  <span className="source-cell">
                    <StatusBadge status={r.source} label={r.source === 'b2c' ? 'B2C' : r.source === 'b2b' ? 'B2B' : undefined} />
                    {r.source === 'affiliate' && r.affiliateCode && <code>{r.affiliateCode}</code>}
                    {r.source === 'b2b' && r.channelSite && <span className="muted">{r.channelSite}</span>}
                  </span>
                ),
              },
              { header: 'Travel date', render: (r) => fmtDate(r.travelDate) },
              { header: 'Amount', align: 'right', render: (r) => peso(r.amount) },
              { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { header: 'Booked', render: (r) => fmtDate(r.createdAt) },
            ]}
          />
        )}
      </Card>
    </>
  );
}
