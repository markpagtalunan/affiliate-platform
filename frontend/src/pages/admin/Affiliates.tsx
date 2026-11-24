import { useState } from 'react';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import { Table } from '../../components/Table';
import { api } from '../../lib/api';
import { errMsg, fmtDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { AdminAffiliate } from '../../types';

const TABS = ['pending', 'active', 'suspended', 'rejected', 'all'] as const;

export default function Affiliates() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('pending');
  const { data, error, loading, reload } = useApi<{ items: AdminAffiliate[] }>(`/admin/affiliates${tab === 'all' ? '' : `?status=${tab}`}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (uid: string, action: 'approve' | 'reject' | 'suspend') => {
    setBusy(uid);
    setErr(null);
    try {
      await api('POST', `/admin/affiliates/${encodeURIComponent(uid)}/${action}`);
      await reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Affiliates" sub="Review applications and manage accounts." />
      <div className="chips">
        {TABS.map((t) => (
          <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {err && <ErrorBox message={err} />}
      <Card>
        {loading && !data ? (
          <Loading />
        ) : error || !data ? (
          <ErrorBox message={error ?? 'No data'} onRetry={reload} />
        ) : (
          <Table
            rows={data.items}
            rowKey={(r) => r.uid}
            empty="No affiliates in this tab."
            columns={[
              { header: 'Name', render: (r) => <><strong>{r.name}</strong><div className="muted">{r.email}</div></> },
              { header: 'Channel', render: (r) => r.promoChannel ?? '-' },
              { header: 'Code', render: (r) => (r.code ? <code>{r.code}</code> : '-') },
              { header: 'Tier', render: (r) => r.tier },
              { header: 'Applied', render: (r) => fmtDate(r.createdAt) },
              { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              {
                header: 'Actions',
                render: (r) => (
                  <div className="row tight">
                    {r.status !== 'active' && <button className="btn small primary" disabled={busy === r.uid} onClick={() => void act(r.uid, 'approve')}>Approve</button>}
                    {r.status === 'pending' && <button className="btn small" disabled={busy === r.uid} onClick={() => void act(r.uid, 'reject')}>Reject</button>}
                    {r.status === 'active' && <button className="btn small danger" disabled={busy === r.uid} onClick={() => void act(r.uid, 'suspend')}>Suspend</button>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
