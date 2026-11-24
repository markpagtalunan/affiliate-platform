import { useState } from 'react';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import { Table } from '../../components/Table';
import { fmtDate, peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Commission } from '../../types';

const FILTERS = ['all', 'pending', 'payable', 'requested', 'paid', 'reversed'] as const;

export default function Sales() {
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('all');
  const { data, error, loading, reload } = useApi<{ items: Commission[] }>(`/commissions${status === 'all' ? '' : `?status=${status}`}`);

  return (
    <>
      <PageHeader title="Sales" sub="Bookings made through your links and the commission earned." />
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${status === f ? 'on' : ''}`} onClick={() => setStatus(f)}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <Card>
        {loading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorBox message={error ?? 'No data'} onRetry={reload} />
        ) : (
          <Table
            rows={data.items}
            rowKey={(r) => r.ref}
            empty="No sales match this filter."
            columns={[
              { header: 'Ref', render: (r) => r.ref },
              { header: 'Package', render: (r) => r.packageName },
              { header: 'Travel date', render: (r) => fmtDate(r.travelDate) },
              { header: 'Booking', align: 'right', render: (r) => peso(r.amount) },
              { header: 'Rate', align: 'right', render: (r) => `${r.rate}%` },
              { header: 'Commission', align: 'right', render: (r) => peso(r.commission) },
              { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
