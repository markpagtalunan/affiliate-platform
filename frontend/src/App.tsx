import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { ADMIN_NAV, AFFILIATE_NAV, Layout } from './components/Layout';
import { ErrorBox, Loading } from './components/Card';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Pending from './pages/Pending';
import AAnalytics from './pages/affiliate/Analytics';
import AdAnalytics from './pages/admin/Analytics';
import ADashboard from './pages/affiliate/Dashboard';
import APackages from './pages/affiliate/Packages';
import ALinks from './pages/affiliate/Links';
import ASales from './pages/affiliate/Sales';
import APayouts from './pages/affiliate/Payouts';
import ASettings from './pages/affiliate/Settings';
import AdDashboard from './pages/admin/Dashboard';
import AdBookings from './pages/admin/Bookings';
import AdAffiliates from './pages/admin/Affiliates';
import AdPayouts from './pages/admin/Payouts';
import AdSettings from './pages/admin/Settings';

function Guard({ role, children }: { role: 'affiliate' | 'admin'; children: ReactNode }) {
  const { user, me, loading, error, signOut } = useAuth();
  if (loading) return <Loading text="Loading your account..." />;
  if (!user) return <Navigate to="/welcome" replace />;
  if (!me) {
    return (
      <div className="center-page">
        <ErrorBox message={error ?? 'Could not load your account.'} onRetry={() => void signOut()} />
      </div>
    );
  }
  if (me.role === 'admin') return role === 'admin' ? <>{children}</> : <Navigate to="/admin" replace />;
  if (me.status !== 'active') return <Navigate to="/pending" replace />;
  if (role === 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/pending" element={<Pending />} />
      <Route
        element={
          <Guard role="affiliate">
            <Layout variant="portal" nav={AFFILIATE_NAV} />
          </Guard>
        }
      >
        <Route path="/" element={<ADashboard />} />
        <Route path="/analytics" element={<AAnalytics />} />
        <Route path="/packages" element={<APackages />} />
        <Route path="/links" element={<ALinks />} />
        <Route path="/sales" element={<ASales />} />
        <Route path="/payouts" element={<APayouts />} />
        <Route path="/settings" element={<ASettings />} />
      </Route>
      <Route
        path="/admin"
        element={
          <Guard role="admin">
            <Layout variant="admin" nav={ADMIN_NAV} />
          </Guard>
        }
      >
        <Route index element={<AdDashboard />} />
        <Route path="analytics" element={<AdAnalytics />} />
        <Route path="bookings" element={<AdBookings />} />
        <Route path="affiliates" element={<AdAffiliates />} />
        <Route path="payouts" element={<AdPayouts />} />
        <Route path="settings" element={<AdSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
