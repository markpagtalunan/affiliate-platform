import { useState } from 'react';
import { Card, Empty, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { api } from '../../lib/api';
import { errMsg, peso } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { MyPackage, Pkg } from '../../types';

export default function Packages() {
  const pk = useApi<{ items: Pkg[] }>('/packages');
  const mine = useApi<{ items: MyPackage[] }>('/my-packages');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (pk.loading || mine.loading) return <Loading />;
  if (pk.error || !pk.data) return <ErrorBox message={pk.error ?? 'No data'} onRetry={pk.reload} />;
  if (mine.error || !mine.data) return <ErrorBox message={mine.error ?? 'No data'} onRetry={mine.reload} />;

  const added = new Set(mine.data.items.map((i) => i.packageId));

  const toggle = async (p: Pkg) => {
    setBusy(p.id);
    setErr(null);
    try {
      if (added.has(p.id)) await api('DELETE', `/my-packages/${encodeURIComponent(p.id)}`);
      else await api('PUT', `/my-packages/${encodeURIComponent(p.id)}`, { packageName: p.name });
      await mine.reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Packages" sub={`${added.size} of ${pk.data.items.length} added to your list. Added packages appear in the link builder.`} />
      {err && <ErrorBox message={err} />}
      {pk.data.items.length === 0 ? (
        <Empty text="No packages available right now." />
      ) : (
        <div className="grid cards">
          {pk.data.items.map((p, i) => (
            <Card key={p.id} className="pkg">
              <div className={`pkg-img g${i % 6}`} style={p.image ? { backgroundImage: `url(${p.image})` } : undefined} />
              <h3>{p.name}</h3>
              <p className="muted">
                {p.destination ?? ''} {p.destination ? '-' : ''} {p.days} days
              </p>
              <p className="price">{peso(p.price)}</p>
              <button className={`btn ${added.has(p.id) ? '' : 'primary'} block`} disabled={busy === p.id} onClick={() => void toggle(p)}>
                {added.has(p.id) ? 'Remove from my list' : 'Add to my list'}
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
