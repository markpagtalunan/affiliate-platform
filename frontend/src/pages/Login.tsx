import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DemoBanner } from '../components/Layout';
import { ErrorBox } from '../components/Card';
import ThemeSwitcher from '../components/ThemeSwitcher';
import '../lib/theme';
import { USE_MOCK } from '../lib/firebase';

export default function Login() {
  const { user, me, loading, error, signIn } = useAuth();
  if (!loading && user && me) return <Navigate to={me.role === 'admin' ? '/admin' : me.status === 'active' ? '/' : '/pending'} replace />;
  return (
    <div>
      <DemoBanner />
      <div className="center-page">
        <div className="card login-card">
          <div className="logo-mark">A</div>
          <h1>Affiliate Portal</h1>
          <p className="muted">Earn commission by sharing travel packages. Sign in to continue.</p>
          {error && <ErrorBox message={error} />}
          <button className="btn primary block" onClick={() => void signIn('affiliate')} disabled={loading}>
            Continue with Google
          </button>
          {USE_MOCK && (
            <div className="demo-switch">
              <span className="muted">Demo as:</span>
              <div className="chips">
                <button className="chip" onClick={() => void signIn('affiliate')}>Affiliate</button>
                <button className="chip" onClick={() => void signIn('admin')}>Admin</button>
                <button className="chip" onClick={() => void signIn('pending')}>Pending applicant</button>
              </div>
            </div>
          )}
          <div className="theme-row">
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </div>
  );
}
