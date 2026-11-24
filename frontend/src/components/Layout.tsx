import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { USE_MOCK } from '../lib/firebase';
import { resetMockData } from '../mock/server';
import ThemeSwitcher from './ThemeSwitcher';

export function DemoBanner() {
  if (!USE_MOCK) return null;
  return (
    <div className="demo-banner">
      <span>Demo mode: sample data stored in your browser, no backend or Firebase.</span>
      <button
        className="link-btn"
        onClick={() => {
          resetMockData();
          window.location.reload();
        }}
      >
        Reset data
      </button>
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

export function Layout({ variant, nav }: { variant: 'portal' | 'admin'; nav: NavItem[] }) {
  const { me, user, signOut } = useAuth();
  return (
    <div>
      <DemoBanner />
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="brand-mark">L</span>
            {variant === 'admin' ? 'Back Office' : 'Affiliates'}
          </div>
          <nav aria-label="Main">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="top-right">
            <ThemeSwitcher />
            <div className="who">
              <strong>{me?.name || user?.name}</strong>
              <span>{variant === 'portal' && me?.code ? `Code: ${me.code}` : me?.email || user?.email}</span>
            </div>
            <button className="btn small" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export const AFFILIATE_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/analytics', label: 'Analytics' },
  { to: '/packages', label: 'Packages' },
  { to: '/links', label: 'Links' },
  { to: '/sales', label: 'Sales' },
  { to: '/payouts', label: 'Payouts' },
  { to: '/settings', label: 'Settings' },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/bookings', label: 'Bookings' },
  { to: '/admin/affiliates', label: 'Affiliates' },
  { to: '/admin/payouts', label: 'Payouts' },
  { to: '/admin/settings', label: 'Settings' },
];
