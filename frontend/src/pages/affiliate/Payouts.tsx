import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Card, ErrorBox, Loading, PageHeader, Stat } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import { Table } from '../../components/Table';
import { api } from '../../lib/api';
import { errMsg, fmtDate, peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { PayoutMethod, PayoutsResponse } from '../../types';

export default function Payouts() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<PayoutsResponse>('/payouts');
  const [method, setMethod] = useState<PayoutMethod>(me?.payout?.method ?? 'gcash');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'No data'} onRetry={reload} />;

  const request = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('POST', '/payouts/request', { method });
      setMsg({ ok: true, text: 'Payout requested. We will notify you once it is paid.' });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const b = data.balance;
  const saved = me?.payout;

  return (
    <>
      <PageHeader title="Payouts" sub="Request a payout once your commissions are payable." />
      <div className="grid kpis">
        <Stat label="Payable" value={peso(b.payable)} hint="Ready to withdraw" />
        <Stat label="Pending" value={peso(b.pending)} hint="In approval window" />
        <Stat label="Requested" value={peso(b.requested)} hint="Awaiting payment" />
        <Stat label="Paid" value={peso(b.paid)} hint="Lifetime" />
      </div>

      <Card title="Request payout">
        <div className="chips">
          <button className={`chip ${method === 'gcash' ? 'on' : ''}`} onClick={() => setMethod('gcash')}>GCash</button>
          <button className={`chip ${method === 'bank' ? 'on' : ''}`} onClick={() => setMethod('bank')}>Bank transfer</button>
        </div>
        <p className="muted">
          {saved && saved.method === method
            ? method === 'gcash' ? `Sending to GCash ${saved.gcashNumber ?? ''}` : `Sending to ${saved.bankName ?? ''} ${saved.accountNumber ?? ''} (${saved.accountName ?? ''})`
            : <>No {method === 'gcash' ? 'GCash' : 'bank'} details saved. <Link to="/settings">Add them in Settings</Link>.</>}
        </p>
        {msg && <div className={`notice ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
        <button className="btn primary" disabled={busy || b.payable <= 0} onClick={() => void request()}>
          {busy ? 'Requesting...' : `Request payout of ${peso(b.payable)}`}
        </button>
      </Card>

      <Card title="History">
        <Table
          rows={data.items}
          rowKey={(r) => r.id}
          empty="No payouts yet."
          columns={[
            { header: 'Requested', render: (r) => fmtDate(r.requestedAt) },
            { header: 'Method', render: (r) => (r.method === 'gcash' ? 'GCash' : 'Bank') },
            { header: 'Amount', align: 'right', render: (r) => peso(r.amount) },
            { header: 'Paid on', render: (r) => fmtDate(r.paidAt) },
            { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </Card>
    </>
  );
}
