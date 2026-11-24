import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Card, PageHeader } from '../../components/Card';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/format';
import type { Me, PayoutDetails, PayoutMethod } from '../../types';

export default function Settings() {
  const { me, setMe } = useAuth();
  const [name, setName] = useState(me?.name ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [promo, setPromo] = useState(me?.promoChannel ?? '');
  const [method, setMethod] = useState<PayoutMethod>(me?.payout?.method ?? 'gcash');
  const [gcash, setGcash] = useState(me?.payout?.gcashNumber ?? '');
  const [bankName, setBankName] = useState(me?.payout?.bankName ?? '');
  const [accName, setAccName] = useState(me?.payout?.accountName ?? '');
  const [accNo, setAccNo] = useState(me?.payout?.accountNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!me) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const payout: PayoutDetails =
      method === 'gcash' ? { method, gcashNumber: gcash.trim() } : { method, bankName: bankName.trim(), accountName: accName.trim(), accountNumber: accNo.trim() };
    try {
      const updated = await api<Me>('PATCH', '/me', { name: name.trim(), phone: phone.trim(), promoChannel: promo.trim(), payout });
      setMe(updated);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" sub="Your profile and payout details." />
      <form onSubmit={(e) => void submit(e)}>
        <Card title="Profile">
          <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="field"><span>Email</span><input value={me.email} disabled /></label>
          <label className="field"><span>Phone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
          <label className="field"><span>Promo channel</span><input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Facebook page, TikTok, etc." /></label>
          <label className="field"><span>Referral code</span><input value={me.code ?? ''} disabled /></label>
        </Card>
        <Card title="Payout details">
          <div className="chips">
            <button type="button" className={`chip ${method === 'gcash' ? 'on' : ''}`} onClick={() => setMethod('gcash')}>GCash</button>
            <button type="button" className={`chip ${method === 'bank' ? 'on' : ''}`} onClick={() => setMethod('bank')}>Bank transfer</button>
          </div>
          {method === 'gcash' ? (
            <label className="field"><span>GCash number</span><input value={gcash} onChange={(e) => setGcash(e.target.value)} inputMode="tel" /></label>
          ) : (
            <>
              <label className="field"><span>Bank name</span><input value={bankName} onChange={(e) => setBankName(e.target.value)} /></label>
              <label className="field"><span>Account name</span><input value={accName} onChange={(e) => setAccName(e.target.value)} /></label>
              <label className="field"><span>Account number</span><input value={accNo} onChange={(e) => setAccNo(e.target.value)} inputMode="numeric" /></label>
            </>
          )}
        </Card>
        {msg && <div className={`notice ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
      </form>
    </>
  );
}
