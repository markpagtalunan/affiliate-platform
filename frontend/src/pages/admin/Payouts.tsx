import { useState } from 'react';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import { Table } from '../../components/Table';
import { api, download } from '../../lib/api';
import { errMsg, fmtDate, peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Payout } from '../../types';

const TABS = ['requested', 'paid', 'rejected', 'all'] as const;

export default function Payouts() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('requested');
  const { data, error, loading, reload } = useApi<{ items: Payout[] }>(`/admin/payouts${tab === 'all' ? '' : `?status=${tab}`}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Payouts"
        sub="Process affiliate payout requests."
        action={
          <div className="row tight">
            <button
              className="btn"
              disabled={busy === 'approvals'}
              onClick={() =>
                void run('approvals', async () => {
                  const r = await api<{ moved: number }>('POST', '/admin/commissions/run-approvals');
                  return `${r.moved} commission${r.moved === 1 ? '' : 's'} moved to payable.`;
                })
              }
            >
              Run approvals
            </button>
            <button className="btn primary" disabled={busy === 'csv'} onClick={() => void run('csv', async () => { await download('/admin/payouts/export.csv', 'payouts.csv'); })}>
              Export CSV
            </button>
          </div>
        }
      />
      <div className="chips">
        {TABS.map((t) => (
          <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
      <Card>
        {loading && !data ? (
          <Loading />
        ) : error || !data ? (
          <ErrorBox message={error ?? 'No data'} onRetry={reload} />
        ) : (
          <Table
            rows={data.items}
            rowKey={(r) => r.id}
            empty="No payouts in this tab."
            columns={[
              { header: 'Affiliate', render: (r) => r.affiliateName },
              { header: 'Requested', render: (r) => fmtDate(r.requestedAt) },
              { header: 'Method', render: (r) => (r.method === 'gcash' ? 'GCash' : 'Bank') },
              { header: 'Amount', align: 'right', render: (r) => peso(r.amount) },
              { header: 'Paid on', render: (r) => fmtDate(r.paidAt) },
              { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              {
                header: 'Actions',
                render: (r) =>
                  r.status === 'requested' ? (
                    <div className="row tight">
                      <button className="btn small primary" disabled={busy === r.id} onClick={() => void run(r.id, async () => { await api('POST', `/admin/payouts/${encodeURIComponent(r.id)}/mark-paid`); })}>Mark paid</button>
                      <button className="btn small danger" disabled={busy === r.id} onClick={() => void run(r.id, async () => { await api('POST', `/admin/payouts/${encodeURIComponent(r.id)}/reject`); })}>Reject</button>
                    </div>
                  ) : (
                    '-'
                  ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
