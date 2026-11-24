import { HttpError, type BookingState, type Repo } from './index.js';
import type { Affiliate, AffiliatePackage, Booking, Click, Commission, Payout, Settings } from '../types.js';

const clone = <T>(v: T): T => structuredClone(v);
const inRange = (t: string, from?: string, to?: string): boolean => (!from || t >= from) && (!to || t < to);

export class MemoryRepo implements Repo {
  private affiliates = new Map<string, Affiliate>();
  private codes = new Map<string, string>();
  private pkgs = new Map<string, AffiliatePackage & { uid: string }>();
  private clicks: Click[] = [];
  private bookings = new Map<string, Booking>();
  private commissions = new Map<string, Commission>();
  private payouts = new Map<string, Payout>();
  private settings: Settings | null = null;

  async getAffiliate(uid: string) {
    const a = this.affiliates.get(uid);
    return a ? clone(a) : null;
  }
  async getAffiliateByCode(code: string) {
    for (const a of this.affiliates.values()) if (a.code === code) return clone(a);
    return null;
  }
  async createAffiliateIfAbsent(a: Affiliate) {
    const ex = this.affiliates.get(a.uid);
    if (ex) return { created: false, affiliate: clone(ex) };
    this.affiliates.set(a.uid, clone(a));
    return { created: true, affiliate: clone(a) };
  }
  async updateAffiliate(uid: string, patch: Partial<Affiliate>) {
    const ex = this.affiliates.get(uid);
    if (!ex) return null;
    const next = { ...ex, ...clone(patch) } as Affiliate;
    this.affiliates.set(uid, next);
    return clone(next);
  }
  async listAffiliates() {
    return [...this.affiliates.values()].map(clone);
  }
  async claimCode(code: string, uid: string) {
    if (this.codes.has(code)) return false;
    this.codes.set(code, uid);
    return true;
  }

  async listMyPackages(uid: string) {
    return [...this.pkgs.values()]
      .filter((p) => p.uid === uid)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      .map(({ packageId, packageName, addedAt }) => ({ packageId, packageName, addedAt }));
  }
  async addMyPackage(uid: string, packageId: string, packageName: string) {
    const k = `${uid}_${packageId}`;
    if (!this.pkgs.has(k)) this.pkgs.set(k, { uid, packageId, packageName, addedAt: new Date().toISOString() });
  }
  async removeMyPackage(uid: string, packageId: string) {
    this.pkgs.delete(`${uid}_${packageId}`);
  }

  async addClick(c: Click) {
    this.clicks.push(clone(c));
  }
  async listClicks(q: { from: string; to: string; uid?: string }) {
    return this.clicks.filter((c) => (!q.uid || c.uid === q.uid) && inRange(c.ts, q.from, q.to)).map(clone);
  }

  async getBooking(ref: string) {
    const b = this.bookings.get(ref);
    return b ? clone(b) : null;
  }
  async listBookings(q: Parameters<Repo['listBookings']>[0]) {
    return [...this.bookings.values()]
      .filter((b) => (!q.uid || b.affiliateUid === q.uid) && (!q.source || b.source === q.source) && (!q.status || b.status === q.status) && inRange(b.createdAt, q.from, q.to))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }
  async processBooking(ref: string, fn: (cur: BookingState) => BookingState & { booking: Booking }) {
    // No awaits between read and write: atomic on the JS event loop.
    const cur: BookingState = { booking: clone(this.bookings.get(ref)), commission: clone(this.commissions.get(ref)) };
    const next = fn(cur);
    this.bookings.set(ref, clone(next.booking));
    if (next.commission) this.commissions.set(ref, clone(next.commission));
    return clone(next);
  }

  async listCommissions(q: Parameters<Repo['listCommissions']>[0]) {
    return [...this.commissions.values()]
      .filter((c) => (!q.uid || c.uid === q.uid) && (!q.status || c.status === q.status) && inRange(c.createdAt, q.from, q.to))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }
  async approveDueCommissions(cutoffMs: number, nowIso: string) {
    let n = 0;
    for (const c of this.commissions.values()) {
      const t = Date.parse(c.travelDate);
      if (c.status === 'pending' && !Number.isNaN(t) && t < cutoffMs) {
        c.status = 'payable';
        c.updatedAt = nowIso;
        n++;
      }
    }
    return n;
  }

  async createPayoutFromPayable(uid: string, build: (payable: Commission[]) => Payout | null) {
    const payable = [...this.commissions.values()].filter((c) => c.uid === uid && c.status === 'payable');
    const payout = build(payable.map(clone));
    if (!payout) return null;
    for (const c of payable) {
      c.status = 'requested';
      c.payoutId = payout.id;
    }
    this.payouts.set(payout.id, clone(payout));
    return clone(payout);
  }
  async settlePayout(id: string, action: 'paid' | 'rejected', nowIso: string) {
    const p = this.payouts.get(id);
    if (!p) throw new HttpError(404, 'Payout not found');
    if (p.status !== 'requested') throw new HttpError(409, 'Payout already processed');
    p.status = action;
    if (action === 'paid') p.paidAt = nowIso;
    for (const ref of p.commissionRefs) {
      const c = this.commissions.get(ref);
      if (!c) continue;
      c.status = action === 'paid' ? 'paid' : 'payable';
      if (action === 'rejected') delete c.payoutId;
      c.updatedAt = nowIso;
    }
    return clone(p);
  }
  async listPayouts(q: Parameters<Repo['listPayouts']>[0]) {
    return [...this.payouts.values()]
      .filter((p) => (!q.uid || p.uid === q.uid) && (!q.status || p.status === q.status))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .map(clone);
  }

  async getSettings() {
    return this.settings ? clone(this.settings) : null;
  }
  async putSettings(s: Settings) {
    this.settings = clone(s);
  }
}
