import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DemoBanner } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';

const COPY: Record<string, string> = {
  pending: 'Your application is under review. We will email you once it is approved.',
  rejected: 'Your application was not approved. Contact support if you think this is a mistake.',
  suspended: 'Your account is suspended. Contact support for details.',
};

export default function Pending() {
  const { user, me, loading, signOut, refreshMe } = useAuth();
  if (loading) return null;
  if (!user || !me) return <Navigate to="/login" replace />;
  if (me.role === 'admin') return <Navigate to="/admin" replace />;
  if (me.status === 'active') return <Navigate to="/" replace />;
  return (
    <div className="theme-portal">
      <DemoBanner />
      <div className="center-page">
        <div className="card login-card">
          <h1>Hi, {me.name}</h1>
          <p>
            <StatusBadge status={me.status} />
          </p>
          <p className="muted">{COPY[me.status]}</p>
          <div className="row">
            <button className="btn primary" onClick={() => void refreshMe()}>
              Check status
            </button>
            <button className="btn" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
