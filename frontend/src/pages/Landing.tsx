import { Link } from 'react-router-dom';
import { DemoBanner } from '../components/Layout';
import ThemeSwitcher from '../components/ThemeSwitcher';

const STEPS = [
  { n: '1', title: 'Register', text: 'Sign in with Google. The team approves your application.' },
  { n: '2', title: 'Add packages', text: 'Choose from the LakbayHub catalog.' },
  { n: '3', title: 'Share your link', text: 'Every booking from your link or QR is tracked to you.' },
  { n: '4', title: 'Get paid', text: 'Commission is paid to GCash or your bank.' },
];

const TIERS = [
  { name: 'Bronze', rate: '5%', rule: 'Starting tier' },
  { name: 'Silver', rate: '7%', rule: '10 bookings in a quarter' },
  { name: 'Gold', rate: '10%', rule: '25 bookings in a quarter' },
  { name: 'Platinum', rate: '12%', rule: '50 bookings in a quarter' },
];

export default function Landing() {
  return (
    <div>
      <DemoBanner />
      <section className="landing-hero">
        <div className="landing-in">
          <div className="landing-nav">
            <div className="brand">
              <span className="brand-mark" style={{ background: 'rgba(255,255,255,0.22)' }}>L</span> LakbayHub Affiliates
            </div>
            <div className="row tight">
              <ThemeSwitcher />
              <Link className="btn" to="/login">Log in</Link>
              <Link className="btn light" to="/login">Become an affiliate</Link>
            </div>
          </div>
          <h1 className="hero-title">Earn by sharing holiday packages you believe in.</h1>
          <p className="hero-sub">
            Pick packages from the LakbayHub catalog, share your tracked link or QR, and get paid a commission on every confirmed booking. Payouts go to GCash or your bank.
          </p>
          <Link className="btn light" to="/login">Register as affiliate</Link>
        </div>
      </section>
      <main className="landing-main">
        <section>
          <h2 className="section-title">How it works</h2>
          <div className="steps-grid">
            {STEPS.map((s) => (
              <div key={s.n} className="card" style={{ marginBottom: 0 }}>
                <div className="step-n">{s.n}</div>
                <strong>{s.title}</strong>
                <div className="muted">{s.text}</div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="section-title">Grow into a higher commission tier</h2>
          <div className="grid kpis" style={{ marginBottom: 0 }}>
            {TIERS.map((t) => (
              <div key={t.name} className="card" style={{ background: 'var(--card)', color: 'inherit' }}>
                <div className="muted">{t.name}</div>
                <div className="tier-rate">{t.rate}</div>
                <div className="muted">{t.rule}</div>
              </div>
            ))}
          </div>
          <p className="muted">Sample tier values. Final rates are set by the back office.</p>
        </section>
      </main>
    </div>
  );
}
