import type { Config } from '../config/env.js';
import { cached, type Cache } from '../config/valkey.js';
import type { Repo } from '../repo/index.js';
import { CHANNELS, SOURCES, TIERS, type Affiliate, type BookingSource, type Channel, type Range } from '../types.js';
import { DAY, bucketIndex, buildBuckets, iso, startOfLocalMonth, type Bucket } from '../util/time.js';
import { pct, publicCommission, sum, type CoreService } from './core.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round1 = (n: number): number => Math.round(n * 10) / 10;

export class AnalyticsService {
  constructor(private config: Config, private repo: Repo, private cache: Cache, private core: CoreService) {}

  private get off(): number {
    return this.config.tzOffsetMinutes;
  }

  /* ---------- affiliate dashboard ---------- */

  async dashboard(aff: Affiliate) {
    return cached(this.cache, `dash:${aff.uid}`, 60, async () => {
      const now = Date.now();
      const settings = await this.core.getSettings();
      const sixAgo = startOfLocalMonth(now, this.off, -5);
      const [commissions, clicks, bookings, qCount] = await Promise.all([
        this.repo.listCommissions({ uid: aff.uid }),
        this.repo.listClicks({ uid: aff.uid, from: iso(now - 30 * DAY), to: iso(now + 1000) }),
        this.repo.listBookings({ uid: aff.uid, status: 'confirmed', from: iso(now - 30 * DAY) }),
        this.core.confirmedThisQuarter(aff.uid),
      ]);
      const bars: { month: string; value: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const start = startOfLocalMonth(now, this.off, -i);
        const end = startOfLocalMonth(now, this.off, -i + 1);
        const month = MONTHS[new Date(start + this.off * 60_000).getUTCMonth()];
        const value = sum(commissions.filter((c) => c.status !== 'reversed' && c.createdAt >= iso(Math.max(start, sixAgo)) && c.createdAt < iso(end)).map((c) => c.commission));
        bars.push({ month, value });
      }
      return {
        clicks30d: clicks.length,
        bookings30d: bookings.length,
        conversionPct: pct(bookings.length, clicks.length),
        earnedThisMonth: bars[5].value,
        bars,
        funnel: { clicks: clicks.length, bookings: bookings.length },
        tier: this.core.tierInfo(aff.tier, settings, qCount),
        recent: commissions.slice(0, 5).map(publicCommission),
      };
    });
  }

  /* ---------- affiliate analytics ---------- */

  async affiliateOverview(aff: Affiliate, range: Range) {
    return cached(this.cache, `ana:aff:${aff.uid}:${range}`, 60, () => this.computeAffiliate(aff, range));
  }

  private async computeAffiliate(aff: Affiliate, range: Range) {
    const now = Date.now();
    const cur = buildBuckets(range, false, now, this.off);
    const prev = buildBuckets(range, true, now, this.off);
    const from = iso(prev[0].start);
    const to = iso(cur[cur.length - 1].end);
    const [clicks, bookings, commissions, settings, qCount] = await Promise.all([
      this.repo.listClicks({ uid: aff.uid, from, to }),
      this.repo.listBookings({ uid: aff.uid, from, to }),
      this.repo.listCommissions({ uid: aff.uid }),
      this.core.getSettings(),
      this.core.confirmedThisQuarter(aff.uid),
    ]);
    const bookingPkg = new Map(bookings.map((b) => [b.ref, b]));

    const period = (bs: Bucket[]) => {
      const lo = iso(bs[0].start);
      const hi = iso(bs[bs.length - 1].end);
      const series = bs.map((b) => ({ date: b.date, clicks: 0, bookings: 0, earned: 0 }));
      const pc = clicks.filter((c) => c.ts >= lo && c.ts < hi);
      const pb = bookings.filter((b) => b.createdAt >= lo && b.createdAt < hi);
      const pm = commissions.filter((c) => c.createdAt >= lo && c.createdAt < hi && c.status !== 'reversed');
      pc.forEach((c) => {
        const i = bucketIndex(bs, Date.parse(c.ts));
        if (i >= 0) series[i].clicks++;
      });
      const confirmed = pb.filter((b) => b.status === 'confirmed');
      confirmed.forEach((b) => {
        const i = bucketIndex(bs, Date.parse(b.createdAt));
        if (i >= 0) series[i].bookings++;
      });
      pm.forEach((c) => {
        const i = bucketIndex(bs, Date.parse(c.createdAt));
        if (i >= 0) series[i].earned += c.commission;
      });
      const revenue = sum(confirmed.map((b) => b.amount));
      const kpis = {
        clicks: pc.length,
        bookings: confirmed.length,
        conversionPct: pct(confirmed.length, pc.length),
        earned: sum(pm.map((c) => c.commission)),
        avgBookingValue: confirmed.length ? Math.round(revenue / confirmed.length) : 0,
      };
      return { series, kpis, pc, pb, confirmed, pm };
    };

    const c = period(cur);
    const p = period(prev);

    // by package
    const pk = new Map<string, { packageId: string; name: string; clicks: number; bookings: number; earned: number }>();
    const slot = (id: string, name?: string) => {
      let r = pk.get(id);
      if (!r) pk.set(id, (r = { packageId: id, name: name ?? id, clicks: 0, bookings: 0, earned: 0 }));
      if (name && r.name === id) r.name = name;
      return r;
    };
    c.pc.forEach((k) => k.packageId && slot(k.packageId).clicks++);
    c.confirmed.forEach((b) => (slot(b.packageId, b.packageName).bookings++));
    c.pm.forEach((m) => {
      const b = bookingPkg.get(m.ref);
      if (b) slot(b.packageId, b.packageName).earned += m.commission;
    });
    const byPackage = [...pk.values()]
      .map((r) => ({ ...r, conversionPct: pct(r.bookings, r.clicks) }))
      .sort((a, b) => b.earned - a.earned || b.bookings - a.bookings || b.clicks - a.clicks);

    // by channel (bookings without a recorded channel are apportioned by click share)
    const chClicks = Object.fromEntries(CHANNELS.map((ch) => [ch, 0])) as Record<Channel, number>;
    c.pc.forEach((k) => (chClicks[k.src ?? 'direct']++));
    const chBookings = Object.fromEntries(CHANNELS.map((ch) => [ch, 0])) as Record<Channel, number>;
    let unknown = 0;
    c.confirmed.forEach((b) => (b.channel ? chBookings[b.channel]++ : unknown++));
    if (unknown) {
      const totalClicks = sum(Object.values(chClicks));
      if (!totalClicks) chBookings.direct += unknown;
      else {
        const shares = CHANNELS.map((ch) => ({ ch, exact: (unknown * chClicks[ch]) / totalClicks }));
        shares.forEach((s) => (chBookings[s.ch] += Math.floor(s.exact)));
        let left = unknown - sum(shares.map((s) => Math.floor(s.exact)));
        shares.sort((a, b) => (b.exact % 1) - (a.exact % 1)).forEach((s) => {
          if (left > 0 && s.exact % 1 > 0) {
            chBookings[s.ch]++;
            left--;
          }
        });
        chBookings.direct += left;
      }
    }

    const status = (st: string) => sum(commissions.filter((m) => m.status === st).map((m) => m.commission));
    return {
      range,
      kpis: c.kpis,
      previous: p.kpis,
      series: c.series,
      funnel: { clicks: c.kpis.clicks, startedBooking: c.pb.filter((b) => b.status !== 'cancelled').length, paid: c.confirmed.length },
      byPackage,
      byChannel: CHANNELS.map((ch) => ({ channel: ch, clicks: chClicks[ch], bookings: chBookings[ch] })),
      commissionByStatus: { pending: status('pending'), payable: status('payable'), requested: status('requested'), paid: status('paid'), reversed: status('reversed') },
      tier: this.core.tierInfo(aff.tier, settings, qCount),
    };
  }

  /* ---------- admin ---------- */

  async adminDashboard() {
    const now = Date.now();
    const from = iso(startOfLocalMonth(now, this.off));
    const [bookings, affiliates, commissions, payouts] = await Promise.all([
      this.repo.listBookings({ from }),
      this.repo.listAffiliates(),
      this.repo.listCommissions({}),
      this.repo.listPayouts({ status: 'requested' }),
    ]);
    const month = bookings.filter((b) => b.status !== 'cancelled');
    const bySource: Partial<Record<BookingSource, { bookings: number; revenue: number }>> = {};
    for (const s of SOURCES) {
      const l = month.filter((b) => b.source === s);
      bySource[s] = { bookings: l.length, revenue: sum(l.filter((b) => b.status === 'confirmed').map((b) => b.amount)) };
    }
    return {
      bookingsThisMonth: month.length,
      revenueThisMonth: sum(month.filter((b) => b.status === 'confirmed').map((b) => b.amount)),
      bySource,
      affiliateSharePct: month.length ? Math.round((month.filter((b) => b.source === 'affiliate').length / month.length) * 100) : 0,
      activeAffiliates: affiliates.filter((a) => a.role === 'affiliate' && a.status === 'active').length,
      pendingAffiliates: affiliates.filter((a) => a.status === 'pending').length,
      commissionLiability: sum(commissions.filter((c) => ['pending', 'payable', 'requested'].includes(c.status)).map((c) => c.commission)),
      pendingPayouts: payouts.length,
    };
  }

  async adminAnalytics(range: Range) {
    return cached(this.cache, `ana:admin:${range}`, 60, () => this.computeAdmin(range));
  }

  private async computeAdmin(range: Range) {
    const now = Date.now();
    const cur = buildBuckets(range, false, now, this.off);
    const prev = buildBuckets(range, true, now, this.off);
    const from = iso(prev[0].start);
    const to = iso(cur[cur.length - 1].end);
    const [clicks, bookings, commissions, affiliatesAll, payouts] = await Promise.all([
      this.repo.listClicks({ from, to }),
      this.repo.listBookings({ from, to }),
      this.repo.listCommissions({ from, to }),
      this.repo.listAffiliates(),
      this.repo.listPayouts({}),
    ]);
    const affiliates = affiliatesAll.filter((a) => a.role === 'affiliate' && a.status !== 'rejected');
    const joined = (a: Affiliate) => a.approvedAt ?? a.createdAt;

    const kpisFor = (bs: Bucket[]) => {
      const lo = iso(bs[0].start);
      const hi = iso(bs[bs.length - 1].end);
      const confirmed = bookings.filter((b) => b.status === 'confirmed' && b.createdAt >= lo && b.createdAt < hi);
      const aff = confirmed.filter((b) => b.source === 'affiliate');
      const clk = clicks.filter((c) => c.ts >= lo && c.ts < hi).length;
      return {
        revenue: sum(confirmed.map((b) => b.amount)),
        bookings: confirmed.length,
        conversionPct: pct(aff.length, clk),
        activeAffiliates: affiliatesAll.filter((a) => a.role === 'affiliate' && a.status === 'active' && joined(a) < hi).length,
        newAffiliates: affiliates.filter((a) => a.createdAt >= lo && a.createdAt < hi).length,
        affiliateSharePct: pct(aff.length, confirmed.length),
        commissionAccrued: sum(commissions.filter((c) => c.status !== 'reversed' && c.createdAt >= lo && c.createdAt < hi).map((c) => c.commission)),
        commissionPaid: sum(payouts.filter((p) => p.status === 'paid' && p.paidAt && p.paidAt >= lo && p.paidAt < hi).map((p) => p.amount)),
      };
    };

    const lo = iso(cur[0].start);
    const emptyPts = () => cur.map((b) => ({ date: b.date, b2c: 0, b2b: 0, affiliate: 0, admin: 0 }));
    const series = emptyPts();
    const bookingsSeries = emptyPts();
    const confirmed = bookings.filter((b) => b.status === 'confirmed' && b.createdAt >= lo);
    confirmed.forEach((b) => {
      const i = bucketIndex(cur, Date.parse(b.createdAt));
      if (i < 0) return;
      series[i][b.source] += b.amount;
      bookingsSeries[i][b.source]++;
    });

    const curClicks = clicks.filter((c) => c.ts >= lo);
    const topAffiliates = affiliatesAll
      .filter((a) => a.role === 'affiliate' && a.status === 'active' && a.code)
      .map((a) => {
        const mine = confirmed.filter((b) => b.affiliateUid === a.uid);
        const k = curClicks.filter((c) => c.uid === a.uid).length;
        return {
          uid: a.uid, name: a.name, code: a.code as string, tier: a.tier, clicks: k, bookings: mine.length, revenue: sum(mine.map((b) => b.amount)),
          commission: sum(commissions.filter((c) => c.uid === a.uid && c.status !== 'reversed' && c.createdAt >= lo).map((c) => c.commission)),
          conversionPct: pct(mine.length, k),
        };
      })
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 10);

    const pk = new Map<string, { packageId: string; name: string; bookings: number; revenue: number; affiliateBookings: number }>();
    confirmed.forEach((b) => {
      const r = pk.get(b.packageId) ?? { packageId: b.packageId, name: b.packageName, bookings: 0, revenue: 0, affiliateBookings: 0 };
      r.bookings++;
      r.revenue += b.amount;
      if (b.source === 'affiliate') r.affiliateBookings++;
      pk.set(b.packageId, r);
    });

    const active = affiliatesAll.filter((a) => a.role === 'affiliate' && a.status === 'active');
    return {
      range,
      kpis: kpisFor(cur),
      previous: kpisFor(prev),
      series,
      bookingsSeries,
      bySource: SOURCES.map((s) => ({ source: s, bookings: sum(bookingsSeries.map((p) => p[s])), revenue: sum(series.map((p) => p[s])) })),
      topAffiliates,
      topPackages: [...pk.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      affiliateGrowth: cur.map((b) => ({ date: b.date, total: affiliates.filter((a) => a.createdAt < iso(b.end)).length })),
      tierDistribution: TIERS.map((t) => ({ tier: t, count: active.filter((a) => a.tier === t).length })),
      payouts: {
        requestedAmount: sum(payouts.filter((p) => p.status === 'requested').map((p) => p.amount)),
        paidAmount: sum(payouts.filter((p) => p.status === 'paid').map((p) => p.amount)),
        liability: sum((await this.repo.listCommissions({})).filter((c) => ['pending', 'payable', 'requested'].includes(c.status)).map((c) => c.commission)),
      },
    };
  }
}

export { round1 };
