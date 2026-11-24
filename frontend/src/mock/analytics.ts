import type {
  AdminAffiliate, AdminAnalytics, AdminKpis, AffiliateAnalytics, AffiliateDashboard, AffKpis, BookingSource, Channel, CommissionStatus, Range, SourcePoint, Tier,
} from '../types';
import { PACKAGES, type Db } from './seed';

/* Deterministic pseudo-random + generated time series so every range looks realistic. */

const DAY = 86400000;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000; // 0..1
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Day offset 0 = today. */
const dayDate = (offset: number): Date => new Date(startOfDay(new Date()).getTime() - offset * DAY);

interface Bucket {
  date: string;
  days: number[]; // day offsets contained in this bucket
}

function buckets(range: Range, shift: boolean): Bucket[] {
  const out: Bucket[] = [];
  if (range === '12m') {
    const now = new Date();
    for (let m = 11; m >= 0; m--) {
      const mm = m + (shift ? 12 : 0);
      const first = new Date(now.getFullYear(), now.getMonth() - mm, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - mm + 1, 1);
      const days: number[] = [];
      const today = startOfDay(now).getTime();
      for (let t = first.getTime(); t < next.getTime(); t += DAY) {
        const off = Math.round((today - t) / DAY);
        if (off >= 0) days.push(off);
      }
      out.push({ date: iso(first), days });
    }
    return out;
  }
  const n = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  for (let i = n - 1; i >= 0; i--) {
    const off = i + (shift ? n : 0);
    out.push({ date: iso(dayDate(off)), days: [off] });
  }
  return out;
}

/** Relative traffic scale per affiliate (unknown/new affiliates get none). */
const SCALE: Record<string, number> = {
  'demo-affiliate': 1,
  'aff-juan': 0.3,
  'aff-gold': 2.1,
  'aff-silver': 1.3,
  'aff-bronze1': 0.45,
  'aff-bronze2': 0.18,
};

interface Day {
  clicks: number;
  bookings: number;
  revenue: number;
  earned: number;
}

const ZERO: Day = { clicks: 0, bookings: 0, revenue: 0, earned: 0 };

function affDay(uid: string, off: number): Day {
  const scale = SCALE[uid] ?? 0;
  if (!scale || off < 0) return ZERO;
  const dt = dayDate(off);
  const wk = [1.25, 0.9, 0.85, 0.9, 1, 1.15, 1.3][dt.getDay()]; // weekends and Sundays trend higher
  const trend = 0.7 + 0.3 * (1 - Math.min(off, 365) / 365); // gradual growth
  const wave = 1 + 0.25 * Math.sin(off / 9 + hash(uid) * 6);
  const noise = 0.7 + hash(`${uid}c${off}`) * 0.6;
  const clicks = Math.round(15 * scale * wk * trend * wave * noise);
  const expected = clicks * 0.034 * (0.8 + hash(`${uid}r${off}`) * 0.5);
  const bookings = Math.floor(expected) + (hash(`${uid}b${off}`) < expected - Math.floor(expected) ? 1 : 0);
  let revenue = 0;
  for (let i = 0; i < bookings; i++) revenue += PACKAGES[Math.floor(hash(`${uid}p${off}.${i}`) * PACKAGES.length)].price;
  return { clicks, bookings, revenue, earned: Math.round(revenue * 0.07) };
}

const sum = (a: Day, b: Day): Day => ({ clicks: a.clicks + b.clicks, bookings: a.bookings + b.bookings, revenue: a.revenue + b.revenue, earned: a.earned + b.earned });
const bucketDay = (uid: string, b: Bucket, lag = 0): Day => b.days.reduce((acc, off) => sum(acc, affDay(uid, off + lag)), ZERO);
const total = (uid: string, bs: Bucket[], lag = 0): Day => bs.reduce((acc, b) => sum(acc, bucketDay(uid, b, lag)), ZERO);

/** Last-30-day clicks/bookings so the classic dashboard agrees with the analytics page. */
export function affiliate30d(uid: string): { clicks: number; bookings: number } {
  const t = total(uid, buckets('30d', false));
  return { clicks: t.clicks, bookings: t.bookings };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (a: number, b: number): number => (b ? round1((a / b) * 100) : 0);

const toKpis = (d: Day): AffKpis => ({
  clicks: d.clicks,
  bookings: d.bookings,
  conversionPct: pct(d.bookings, d.clicks),
  earned: d.earned,
  avgBookingValue: d.bookings ? Math.round(d.revenue / d.bookings) : 0,
});

const PKG_W = [0.29, 0.22, 0.17, 0.14, 0.1, 0.08];
const CH: { channel: Channel; clicks: number; bookings: number }[] = [
  { channel: 'facebook', clicks: 0.42, bookings: 0.36 },
  { channel: 'messenger', clicks: 0.18, bookings: 0.24 },
  { channel: 'whatsapp', clicks: 0.15, bookings: 0.2 },
  { channel: 'direct', clicks: 0.17, bookings: 0.14 },
  { channel: 'other', clicks: 0.08, bookings: 0.06 },
];

export function affiliateOverview(db: Db, me: AdminAffiliate, range: Range, tier: AffiliateDashboard['tier']): AffiliateAnalytics {
  const cur = buckets(range, false);
  const prev = buckets(range, true);
  const cd = total(me.uid, cur);
  const series = cur.map((b) => {
    const d = bucketDay(me.uid, b);
    return { date: b.date, clicks: d.clicks, bookings: d.bookings, earned: d.earned };
  });
  const weightedEarn = PKG_W.map((w, i) => w * PACKAGES[i].price);
  const wsum = weightedEarn.reduce((a, b) => a + b, 0);
  const byPackage = PACKAGES.map((p, i) => {
    const clicks = Math.round(cd.clicks * PKG_W[i]);
    const bookings = Math.round(cd.bookings * PKG_W[i]);
    return { packageId: p.id, name: p.name, clicks, bookings, conversionPct: pct(bookings, clicks), earned: Math.round((cd.earned * weightedEarn[i]) / wsum) };
  });
  const mine = db.commissions.filter((c) => c.uid === me.uid);
  const status = (st: CommissionStatus) => mine.filter((c) => c.status === st).reduce((a, c) => a + c.commission, 0);
  return {
    range,
    kpis: toKpis(cd),
    previous: toKpis(total(me.uid, prev)),
    series,
    funnel: { clicks: cd.clicks, startedBooking: Math.min(cd.clicks, Math.round(cd.bookings * 2.8)), paid: cd.bookings },
    byPackage,
    byChannel: CH.map((c) => ({ channel: c.channel, clicks: Math.round(cd.clicks * c.clicks), bookings: Math.round(cd.bookings * c.bookings) })),
    commissionByStatus: { pending: status('pending'), payable: status('payable'), requested: status('requested'), paid: status('paid'), reversed: status('reversed') },
    tier,
  };
}

/* ---------- Admin ---------- */

const SOURCES: BookingSource[] = ['b2c', 'b2b', 'affiliate', 'admin'];
const SRC_BASE: Record<Exclude<BookingSource, 'affiliate'>, number> = { b2c: 3.4, b2b: 2.2, admin: 0.7 };

function srcDay(src: Exclude<BookingSource, 'affiliate'>, off: number): { bookings: number; revenue: number } {
  const dt = dayDate(off);
  const wk = [0.9, 1.1, 1.05, 1, 1.05, 1.15, 0.85][dt.getDay()];
  const trend = 0.75 + 0.25 * (1 - Math.min(off, 365) / 365);
  const expected = SRC_BASE[src] * wk * trend * (0.6 + hash(`${src}n${off}`) * 0.8);
  const bookings = Math.floor(expected) + (hash(`${src}f${off}`) < expected - Math.floor(expected) ? 1 : 0);
  let revenue = 0;
  for (let i = 0; i < bookings; i++) revenue += PACKAGES[Math.floor(hash(`${src}p${off}.${i}`) * PACKAGES.length)].price;
  return { bookings, revenue };
}

function activeUids(db: Db): string[] {
  return db.affiliates.filter((a) => a.role === 'affiliate' && a.status === 'active').map((a) => a.uid);
}

function adminPeriod(db: Db, bs: Bucket[], lag = 0) {
  const uids = activeUids(db);
  const rev: SourcePoint[] = [];
  const bk: SourcePoint[] = [];
  let clicks = 0;
  let commission = 0;
  for (const b of bs) {
    const r = { date: b.date, b2c: 0, b2b: 0, affiliate: 0, admin: 0 };
    const k = { date: b.date, b2c: 0, b2b: 0, affiliate: 0, admin: 0 };
    for (const off of b.days) {
      (['b2c', 'b2b', 'admin'] as const).forEach((s) => {
        const d = srcDay(s, off + lag);
        r[s] += d.revenue;
        k[s] += d.bookings;
      });
    }
    for (const uid of uids) {
      const d = bucketDay(uid, b, lag);
      r.affiliate += d.revenue;
      k.affiliate += d.bookings;
      clicks += d.clicks;
      commission += d.earned;
    }
    rev.push(r);
    bk.push(k);
  }
  return { rev, bk, clicks, commission };
}

const totalOf = (pts: SourcePoint[]): number => pts.reduce((a, p) => a + p.b2c + p.b2b + p.affiliate + p.admin, 0);
const srcTotal = (pts: SourcePoint[], s: BookingSource): number => pts.reduce((a, p) => a + p[s], 0);

function createdBetween(db: Db, from: number, to: number): number {
  return db.affiliates.filter((a) => a.role === 'affiliate' && a.status !== 'rejected' && new Date(a.createdAt).getTime() >= from && new Date(a.createdAt).getTime() < to).length;
}
const countAt = (db: Db, t: number): number => db.affiliates.filter((a) => a.role === 'affiliate' && a.status !== 'rejected' && new Date(a.createdAt).getTime() < t).length;

function adminKpis(db: Db, bs: Bucket[]): AdminKpis {
  const p = adminPeriod(db, bs);
  const paid = adminPeriod(db, bs, 35).commission; // payouts lag accrual by roughly a month
  const bookings = totalOf(p.bk);
  const first = dayDate(bs[0].days[bs[0].days.length - 1]).getTime();
  const end = dayDate(bs[bs.length - 1].days[0]).getTime() + DAY;
  return {
    revenue: totalOf(p.rev),
    bookings,
    conversionPct: pct(srcTotal(p.bk, 'affiliate'), p.clicks),
    activeAffiliates: countAt(db, end),
    newAffiliates: createdBetween(db, first, end),
    affiliateSharePct: pct(srcTotal(p.bk, 'affiliate'), bookings),
    commissionAccrued: p.commission,
    commissionPaid: Math.round(paid * 0.9),
  };
}

export function adminAnalytics(db: Db, range: Range): AdminAnalytics {
  const cur = buckets(range, false);
  const prev = buckets(range, true);
  const p = adminPeriod(db, cur);
  const bookingsTotal = totalOf(p.bk);

  const topAffiliates = db.affiliates
    .filter((a) => a.role === 'affiliate' && a.status === 'active' && a.code)
    .map((a) => {
      const d = total(a.uid, cur);
      return { uid: a.uid, name: a.name, code: a.code as string, tier: a.tier as Tier, clicks: d.clicks, bookings: d.bookings, revenue: d.revenue, commission: d.earned, conversionPct: pct(d.bookings, d.clicks) };
    })
    .sort((x, y) => y.revenue - x.revenue);

  const affBookings = srcTotal(p.bk, 'affiliate');
  const topPackages = PACKAGES.map((pk, i) => {
    const bookings = Math.round(bookingsTotal * PKG_W[i]);
    return { packageId: pk.id, name: pk.name, bookings, revenue: bookings * pk.price, affiliateBookings: Math.min(bookings, Math.round(affBookings * PKG_W[i])) };
  }).sort((x, y) => y.revenue - x.revenue);

  const growth = cur.map((b) => ({ date: b.date, total: countAt(db, dayDate(b.days[0]).getTime() + DAY) }));

  const tiers: Tier[] = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  const payouts = db.payouts;
  const live = db.commissions.filter((c) => ['pending', 'payable', 'requested'].includes(c.status)).reduce((a, c) => a + c.commission, 0);

  return {
    range,
    kpis: adminKpis(db, cur),
    previous: adminKpis(db, prev),
    series: p.rev,
    bookingsSeries: p.bk,
    bySource: SOURCES.map((s) => ({ source: s, bookings: srcTotal(p.bk, s), revenue: srcTotal(p.rev, s) })),
    topAffiliates,
    topPackages,
    affiliateGrowth: growth,
    tierDistribution: tiers.map((t) => ({ tier: t, count: db.affiliates.filter((a) => a.role === 'affiliate' && a.status === 'active' && a.tier === t).length })),
    payouts: {
      requestedAmount: payouts.filter((x) => x.status === 'requested').reduce((a, x) => a + x.amount, 0),
      paidAmount: payouts.filter((x) => x.status === 'paid').reduce((a, x) => a + x.amount, 0),
      liability: live,
    },
  };
}
