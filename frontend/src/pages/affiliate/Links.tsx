import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/Card';
import { B2C_URL } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { MyPackage } from '../../types';

export default function Links() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<{ items: MyPackage[] }>('/my-packages');
  const [pkg, setPkg] = useState('');
  const [copied, setCopied] = useState(false);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'No data'} onRetry={reload} />;
  if (!me?.code) return <ErrorBox message="You do not have a referral code yet." />;

  const link = `${B2C_URL}/?aff=${encodeURIComponent(me.code)}${pkg ? `&pkg=${encodeURIComponent(pkg)}` : ''}`;
  const text = 'Check out this trip!';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this link', link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Shared links carry the channel (&src=...) so analytics can attribute traffic; the plain copy link stays src-less (direct).
  const withSrc = (src: string) => `${link}&src=${src}`;
  const shares = [
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(withSrc('facebook'))}` },
    { label: 'Messenger', href: `fb-messenger://share/?link=${encodeURIComponent(withSrc('messenger'))}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${text} ${withSrc('whatsapp')}`)}` },
  ];

  return (
    <>
      <PageHeader title="Links" sub="Build a tracked referral link and share it." />
      <Card title="Link builder">
        <label className="field">
          <span>Package</span>
          <select value={pkg} onChange={(e) => setPkg(e.target.value)}>
            <option value="">Homepage (no specific package)</option>
            {data.items.map((p) => (
              <option key={p.packageId} value={p.packageId}>
                {p.packageName}
              </option>
            ))}
          </select>
        </label>
        {data.items.length === 0 && <p className="muted">Tip: add packages on the Packages page to link to them directly.</p>}
        <div className="link-box">
          <code>{link}</code>
          <button className="btn primary" onClick={() => void copy()}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
        <div className="row">
          {shares.map((s) => (
            <a key={s.label} className="btn" href={s.href} target="_blank" rel="noreferrer noopener">
              {s.label}
            </a>
          ))}
        </div>
      </Card>
    </>
  );
}
