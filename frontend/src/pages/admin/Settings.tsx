import { useEffect, useState, type FormEvent } from 'react';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Settings as SettingsT } from '../../types';

export default function Settings() {
  const { data, error, loading, reload } = useApi<SettingsT>('/admin/settings');
  const [form, setForm] = useState<SettingsT | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (loading && !form) return <Loading />;
  if (error || !form) return <ErrorBox message={error ?? 'No data'} onRetry={reload} />;

  const num = (v: string): number => (v === '' ? 0 : Number(v));
  const setTier = (i: number, key: 'rate' | 'minBookings', v: string) =>
    setForm({ ...form, tiers: form.tiers.map((t, idx) => (idx === i ? { ...t, [key]: num(v) } : t)) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      setForm(await api<SettingsT>('PUT', '/admin/settings', form));
      setMsg({ ok: true, text: 'Settings saved.' });
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" sub="Commission tiers and payout rules." />
      <form onSubmit={(e) => void submit(e)}>
        <Card title="Commission tiers">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tier</th><th>Rate (%)</th><th>Min bookings / quarter</th></tr>
              </thead>
              <tbody>
                {form.tiers.map((t, i) => (
                  <tr key={t.name}>
                    <td><strong>{t.name}</strong></td>
                    <td><input type="number" min={0} max={100} step="0.1" value={t.rate} onChange={(e) => setTier(i, 'rate', e.target.value)} /></td>
                    <td><input type="number" min={0} value={t.minBookings} onChange={(e) => setTier(i, 'minBookings', e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Rules">
          <label className="field"><span>Approval window (days after travel date)</span>
            <input type="number" min={0} value={form.approvalWindowDays} onChange={(e) => setForm({ ...form, approvalWindowDays: num(e.target.value) })} /></label>
          <label className="field"><span>Minimum payout (PHP)</span>
            <input type="number" min={0} value={form.minPayout} onChange={(e) => setForm({ ...form, minPayout: num(e.target.value) })} /></label>
          <label className="field"><span>Attribution window (days)</span>
            <input type="number" min={0} value={form.attributionDays} onChange={(e) => setForm({ ...form, attributionDays: num(e.target.value) })} /></label>
        </Card>
        {msg && <div className={`notice ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Save settings'}</button>
      </form>
    </>
  );
}
