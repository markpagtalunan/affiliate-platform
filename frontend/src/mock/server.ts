import { ApiError } from '../lib/errors';
import type {
  AdminAffiliate, AdminDashboard, AffiliateDashboard, Commission, CommissionStatus, Me, Payout, PayoutMethod, PayoutsResponse, Settings,
} from '../types';
import { adminAnalytics, affiliate30d, affiliateOverview } from './analytics';
import type { Range } from '../types';
import { DB_VERSION, PACKAGES, UID_ADMIN, UID_AFFILIATE, UID_PENDING, seed, type Db, type DbCommission, type DbPayout } from './seed';

const DB_KEY = 'aff-mock-db';
const ROLE_KEY = 'aff-mock-role';
const DAY = 86400000;

export type DemoRole = 'affiliate' | 'admin' | 'pending';

let memory: Db | null = null;

function load(): Db {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === DB_VERSION) {
        memory = parsed;
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  memory = seed();
  save();
  return memory;
}

function save(): void {
  try {
    if (memory) localStorage.setItem(DB_KEY, JSON.stringify(memory));
  } catch {
    /* ignore */
  }
}

export function resetMockData(): void {
  memory = seed();
  save();
}

export function getDemoRole(): DemoRole | null {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    return r === 'affiliate' || r === 'admin' || r === 'pending' ? r : null;
  } catch {
    return null;
  }
}

export function setDemoRole(role: DemoRole | null): void {
  try {
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  } catch {
    /* ignore */
  }
}

const uidForRole = (r: DemoRole): string => (r === 'admin' ? UID_ADMIN : r === 'pending' ? UID_PENDING : UID_AFFILIATE);

function currentUid(): string {
  const r = getDemoRole();
  if (!r) throw new ApiError(401, 'Not signed in');
  return uidForRole(r);
}

const toMe = (a: AdminAffiliate): Me => {
  const { createdAt: _c, ...me } = a;
  void _c;
  return me;
};

function requireActive(db: Db): AdminAffiliate {
  const a = db.affiliates.find((x) => x.uid === currentUid());
  if (!a) throw new ApiError(401, 'Unknown user');
  if (a.status !== 'active') throw new ApiError(403, 'Account not active');
  return a;
}

function requireAdmin(db: Db): AdminAffiliate {
  const a = requireActive(db);
  if (a.role !== 'admin') throw new ApiError(403, 'Admin only');
  return a;
}

const publicCommission = (c: DbCommission): Commission => ({
  ref: c.ref, packageName: c.packageName, amount: c.amount, rate: c.rate, commission: c.commission,
  status: c.status, travelDate: c.travelDate, createdAt: c.createdAt,
});

const publicPayout = (p: DbPayout): Payout => ({
  id: p.id, uid: p.uid, affiliateName: p.affiliateName, amount: p.amount, method: p.method,
  status: p.status, requestedAt: p.requestedAt, paidAt: p.paidAt,
});

const sumBy = (list: DbCommission[], st: CommissionStatus): number =>
  list.filter((c) => c.status === st).reduce((a, c) => a + c.commission, 0);

function affiliateDashboard(db: Db, me: AdminAffiliate): AffiliateDashboard {
  const mine = db.commissions.filter((c) => c.uid === me.uid);
  const now = new Date();
  const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const bars: { month: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = mine
      .filter((c) => c.status !== 'reversed' && monthKey(new Date(c.createdAt)) === monthKey(d))
      .reduce((a, c) => a + c.commission, 0);
    bars.push({ month: d.toLocaleDateString('en-US', { month: 'short' }), value });
  }
  const { clicks: clicks30d, bookings: bookings30d } = affiliate30d(me.uid);
  const q = Math.floor(now.getMonth() / 3);
  const bookingsThisQuarter = mine.filter((c) => {
    const d = new Date(c.createdAt);
    return c.status !== 'reversed' && d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q;
  }).length;
  const tiers = db.settings.tiers;
  const idx = tiers.findIndex((t) => t.name === me.tier);
  const cur = tiers[idx] ?? tiers[0];
  const next = tiers[idx + 1];
  return {
    clicks30d,
    bookings30d,
    conversionPct: clicks30d ? Math.round((bookings30d / clicks30d) * 1000) / 10 : 0,
    earnedThisMonth: bars[5].value,
    bars,
    funnel: { clicks: clicks30d, bookings: bookings30d },
    tier: { name: cur.name, rate: cur.rate, bookingsThisQuarter, nextTier: next ? { name: next.name, rate: next.rate, minBookings: next.minBookings } : undefined },
    recent: [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map(publicCommission),
  };
}

function adminDashboard(db: Db): AdminDashboard {
  const now = new Date();
  const inMonth = (s: string) => {
    const d = new Date(s);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const month = db.bookings.filter((b) => inMonth(b.createdAt) && b.status !== 'cancelled');
  const aff = month.filter((b) => b.source === 'affiliate').length;
  const bySource: NonNullable<AdminDashboard['bySource']> = {};
  (['b2c', 'b2b', 'affiliate', 'admin'] as const).forEach((k) => {
    const list = month.filter((b) => b.source === k);
    bySource[k] = { bookings: list.length, revenue: list.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.amount, 0) };
  });
  return {
    bookingsThisMonth: month.length,
    revenueThisMonth: month.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.amount, 0),
    bySource,
    affiliateSharePct: month.length ? Math.round((aff / month.length) * 100) : 0,
    activeAffiliates: db.affiliates.filter((a) => a.role === 'affiliate' && a.status === 'active').length,
    pendingAffiliates: db.affiliates.filter((a) => a.status === 'pending').length,
    commissionLiability: db.commissions.filter((c) => ['pending', 'payable', 'requested'].includes(c.status)).reduce((a, c) => a + c.commission, 0),
    pendingPayouts: db.payouts.filter((p) => p.status === 'requested').length,
  };
}

function makeCode(db: Db, name: string): string {
  const base = (name.split(/\s+/)[0] || 'AFF').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8) || 'AFF';
  for (let i = 0; i < 100; i++) {
    const code = base + String(Math.floor(10 + Math.random() * 90));
    if (!db.affiliates.some((a) => a.code === code)) return code;
  }
  return base + Date.now().toString().slice(-4);
}

const csvCell = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`;

const parseRange = (r: string | null): Range => (r === '7d' || r === '90d' || r === '12m' ? r : '30d');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function mockRequest(method: string, rawPath: string, body?: unknown): Promise<unknown> {
  await delay(150);
  const [path, qs = ''] = rawPath.split('?');
  const q = new URLSearchParams(qs);
  const db = load();
  const b = (body ?? {}) as Record<string, unknown>;
  let m: RegExpMatchArray | null;

  if (method === 'POST' && path === '/auth/session') {
    const a = db.affiliates.find((x) => x.uid === currentUid());
    if (!a) throw new ApiError(401, 'Unknown user');
    return toMe(a);
  }
  if (method === 'GET' && path === '/me') {
    const a = db.affiliates.find((x) => x.uid === currentUid());
    if (!a) throw new ApiError(401, 'Unknown user');
    return toMe(a);
  }
  if (method === 'PATCH' && path === '/me') {
    const a = db.affiliates.find((x) => x.uid === currentUid());
    if (!a) throw new ApiError(401, 'Unknown user');
    if (typeof b.name === 'string' && b.name.trim()) a.name = b.name.trim();
    if (typeof b.phone === 'string') a.phone = b.phone;
    if (typeof b.promoChannel === 'string') a.promoChannel = b.promoChannel;
    if (b.payout && typeof b.payout === 'object') a.payout = b.payout as Me['payout'];
    save();
    return toMe(a);
  }

  if (path.startsWith('/admin/')) {
    requireAdmin(db);
    if (method === 'GET' && path === '/admin/dashboard') return adminDashboard(db);
    if (method === 'GET' && path === '/admin/analytics') return adminAnalytics(db, parseRange(q.get('range')));
    if (method === 'GET' && path === '/admin/bookings') {
      const src = q.get('source');
      const st = q.get('status');
      const items = db.bookings
        .filter((x) => (!src || x.source === src) && (!st || x.status === st))
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
      return { items };
    }
    if (method === 'GET' && path === '/admin/affiliates') {
      const st = q.get('status');
      return { items: db.affiliates.filter((a) => a.role === 'affiliate' && (!st || a.status === st)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)) };
    }
    if ((m = path.match(/^\/admin\/affiliates\/([^/]+)\/(approve|reject|suspend)$/)) && method === 'POST') {
      const a = db.affiliates.find((x) => x.uid === m![1]);
      if (!a) throw new ApiError(404, 'Affiliate not found');
      if (m[2] === 'approve') {
        a.status = 'active';
        a.tier = 'Bronze';
        if (!a.code) a.code = makeCode(db, a.name);
      } else {
        a.status = m[2] === 'reject' ? 'rejected' : 'suspended';
      }
      save();
      return { ok: true };
    }
    if (method === 'GET' && path === '/admin/commissions') {
      const st = q.get('status');
      return { items: db.commissions.filter((c) => !st || c.status === st).map(publicCommission) };
    }
    if (method === 'POST' && path === '/admin/commissions/run-approvals') {
      const limit = Date.now() - db.settings.approvalWindowDays * DAY;
      let moved = 0;
      db.commissions.forEach((c) => {
        if (c.status === 'pending' && new Date(c.travelDate).getTime() < limit) {
          c.status = 'payable';
          moved++;
        }
      });
      save();
      return { moved };
    }
    if (method === 'GET' && path === '/admin/payouts') {
      const st = q.get('status');
      return { items: db.payouts.filter((p) => !st || p.status === st).sort((x, y) => y.requestedAt.localeCompare(x.requestedAt)).map(publicPayout) };
    }
    if (method === 'GET' && path === '/admin/payouts/export.csv') {
      const rows = [['id', 'affiliate', 'amount', 'method', 'status', 'requestedAt', 'paidAt'].join(',')];
      db.payouts.forEach((p) => rows.push([p.id, p.affiliateName, p.amount, p.method, p.status, p.requestedAt, p.paidAt ?? ''].map(csvCell).join(',')));
      return rows.join('\n');
    }
    if ((m = path.match(/^\/admin\/payouts\/([^/]+)\/(mark-paid|reject)$/)) && method === 'POST') {
      const p = db.payouts.find((x) => x.id === m![1]);
      if (!p) throw new ApiError(404, 'Payout not found');
      if (p.status !== 'requested') throw new ApiError(400, 'Payout already processed');
      const paid = m[2] === 'mark-paid';
      p.status = paid ? 'paid' : 'rejected';
      if (paid) p.paidAt = new Date().toISOString();
      db.commissions.forEach((c) => {
        if (p.commissionRefs.includes(c.ref)) {
          c.status = paid ? 'paid' : 'payable';
          if (!paid) c.payoutId = undefined;
        }
      });
      save();
      return { ok: true };
    }
    if (method === 'GET' && path === '/admin/settings') return db.settings;
    if (method === 'PUT' && path === '/admin/settings') {
      const s = body as Settings;
      if (!s || !Array.isArray(s.tiers)) throw new ApiError(400, 'Invalid settings');
      db.settings = s;
      save();
      return db.settings;
    }
    throw new ApiError(404, `No mock route: ${method} ${path}`);
  }

  // Everything below requires an active account.
  const me = requireActive(db);

  if (method === 'GET' && path === '/packages') return { items: PACKAGES };
  if (method === 'GET' && path === '/my-packages') return { items: db.myPackages[me.uid] ?? [] };
  if ((m = path.match(/^\/my-packages\/([^/]+)$/))) {
    const id = decodeURIComponent(m[1]);
    const list = db.myPackages[me.uid] ?? [];
    if (method === 'PUT') {
      if (!list.some((x) => x.packageId === id)) {
        const name = typeof b.packageName === 'string' ? b.packageName : PACKAGES.find((p) => p.id === id)?.name ?? id;
        list.push({ packageId: id, packageName: name, addedAt: new Date().toISOString() });
      }
      db.myPackages[me.uid] = list;
      save();
      return { ok: true };
    }
    if (method === 'DELETE') {
      db.myPackages[me.uid] = list.filter((x) => x.packageId !== id);
      save();
      return { ok: true };
    }
  }
  if (method === 'GET' && path === '/dashboard') return affiliateDashboard(db, me);
  if (method === 'GET' && path === '/analytics/overview') return affiliateOverview(db, me, parseRange(q.get('range')), affiliateDashboard(db, me).tier);
  if (method === 'GET' && path === '/commissions') {
    const st = q.get('status');
    return { items: db.commissions.filter((c) => c.uid === me.uid && (!st || c.status === st)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map(publicCommission) };
  }
  if (method === 'GET' && path === '/payouts') {
    const mine = db.commissions.filter((c) => c.uid === me.uid);
    const res: PayoutsResponse = {
      balance: { payable: sumBy(mine, 'payable'), pending: sumBy(mine, 'pending'), requested: sumBy(mine, 'requested'), paid: sumBy(mine, 'paid') },
      items: db.payouts.filter((p) => p.uid === me.uid).sort((x, y) => y.requestedAt.localeCompare(x.requestedAt)).map(publicPayout),
    };
    return res;
  }
  if (method === 'POST' && path === '/payouts/request') {
    const method2 = b.method as PayoutMethod;
    if (method2 !== 'gcash' && method2 !== 'bank') throw new ApiError(400, 'Choose a payout method');
    const p = me.payout;
    const saved = p && p.method === method2 && (method2 === 'gcash' ? !!p.gcashNumber : !!(p.bankName && p.accountName && p.accountNumber));
    if (!saved) throw new ApiError(400, 'Save your payout details in Settings first');
    const payable = db.commissions.filter((c) => c.uid === me.uid && c.status === 'payable');
    const total = payable.reduce((a, c) => a + c.commission, 0);
    if (total < db.settings.minPayout) throw new ApiError(400, `Minimum payout is ₱${db.settings.minPayout.toLocaleString()}`);
    const id = 'pay-' + Date.now().toString(36);
    payable.forEach((c) => {
      c.status = 'requested';
      c.payoutId = id;
    });
    const payout: DbPayout = {
      id, uid: me.uid, affiliateName: me.name, amount: total, method: method2, status: 'requested',
      requestedAt: new Date().toISOString(), commissionRefs: payable.map((c) => c.ref),
    };
    db.payouts.push(payout);
    save();
    return publicPayout(payout);
  }

  throw new ApiError(404, `No mock route: ${method} ${path}`);
}
