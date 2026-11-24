import { FieldValue, type Firestore, type Query } from 'firebase-admin/firestore';
import { HttpError, type BookingState, type Repo } from './index.js';
import type { Affiliate, AffiliatePackage, Booking, Click, Commission, Payout, Settings } from '../types.js';

const C = {
  affiliates: 'affiliates',
  codes: 'affiliate_codes',
  packages: 'affiliate_packages',
  clicks: 'clicks',
  bookings: 'bookings',
  commissions: 'commissions',
  payouts: 'payouts',
  settings: 'settings',
} as const;

const inRange = (t: string, from?: string, to?: string): boolean => (!from || t >= from) && (!to || t < to);
const isAlreadyExists = (e: unknown): boolean => (e as { code?: number }).code === 6;
const isNotFound = (e: unknown): boolean => (e as { code?: number }).code === 5;

export class FirestoreRepo implements Repo {
  constructor(private db: Firestore) {}

  private col(name: string) {
    return this.db.collection(name);
  }
  private async all<T>(q: Query): Promise<T[]> {
    const s = await q.get();
    return s.docs.map((d) => d.data() as T);
  }

  async getAffiliate(uid: string) {
    const s = await this.col(C.affiliates).doc(uid).get();
    return s.exists ? (s.data() as Affiliate) : null;
  }
  async getAffiliateByCode(code: string) {
    const s = await this.col(C.affiliates).where('code', '==', code).limit(1).get();
    return s.empty ? null : (s.docs[0].data() as Affiliate);
  }
  async createAffiliateIfAbsent(a: Affiliate) {
    try {
      await this.col(C.affiliates).doc(a.uid).create(a);
      return { created: true, affiliate: a };
    } catch (e) {
      if (!isAlreadyExists(e)) throw e;
      return { created: false, affiliate: (await this.getAffiliate(a.uid)) as Affiliate };
    }
  }
  async updateAffiliate(uid: string, patch: Partial<Affiliate>) {
    try {
      await this.col(C.affiliates).doc(uid).update(patch as Record<string, unknown>);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
    return this.getAffiliate(uid);
  }
  async listAffiliates() {
    return this.all<Affiliate>(this.col(C.affiliates));
  }
  async claimCode(code: string, uid: string) {
    try {
      await this.col(C.codes).doc(code).create({ uid, createdAt: new Date().toISOString() });
      return true;
    } catch (e) {
      if (isAlreadyExists(e)) return false;
      throw e;
    }
  }

  async listMyPackages(uid: string) {
    const rows = await this.all<AffiliatePackage & { uid: string }>(this.col(C.packages).where('uid', '==', uid));
    return rows
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      .map(({ packageId, packageName, addedAt }) => ({ packageId, packageName, addedAt }));
  }
  async addMyPackage(uid: string, packageId: string, packageName: string) {
    try {
      await this.col(C.packages).doc(`${uid}_${packageId}`).create({ uid, packageId, packageName, addedAt: new Date().toISOString() });
    } catch (e) {
      if (!isAlreadyExists(e)) throw e;
    }
  }
  async removeMyPackage(uid: string, packageId: string) {
    await this.col(C.packages).doc(`${uid}_${packageId}`).delete();
  }

  async addClick(c: Click) {
    await this.col(C.clicks).doc(c.id).set(c);
  }
  async listClicks(q: { from: string; to: string; uid?: string }) {
    // uid + ts range needs the composite index in firestore.indexes.json
    let query: Query = this.col(C.clicks);
    if (q.uid) query = query.where('uid', '==', q.uid);
    query = query.where('ts', '>=', q.from).where('ts', '<', q.to);
    return this.all<Click>(query);
  }

  async getBooking(ref: string) {
    const s = await this.col(C.bookings).doc(ref).get();
    return s.exists ? (s.data() as Booking) : null;
  }
  async listBookings(q: Parameters<Repo['listBookings']>[0]) {
    // Equality filter OR single-field range only, remaining filters in memory: no composite index required.
    let query: Query = this.col(C.bookings);
    if (q.uid) query = query.where('affiliateUid', '==', q.uid);
    else if (q.from || q.to) {
      if (q.from) query = query.where('createdAt', '>=', q.from);
      if (q.to) query = query.where('createdAt', '<', q.to);
    }
    const rows = await this.all<Booking>(query);
    return rows
      .filter((b) => (!q.source || b.source === q.source) && (!q.status || b.status === q.status) && inRange(b.createdAt, q.from, q.to))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async processBooking(ref: string, fn: (cur: BookingState) => BookingState & { booking: Booking }) {
    const bRef = this.col(C.bookings).doc(ref);
    const cRef = this.col(C.commissions).doc(ref);
    return this.db.runTransaction(async (tx) => {
      const [bs, cs] = await Promise.all([tx.get(bRef), tx.get(cRef)]);
      const next = fn({ booking: bs.exists ? (bs.data() as Booking) : undefined, commission: cs.exists ? (cs.data() as Commission) : undefined });
      tx.set(bRef, next.booking);
      if (next.commission) tx.set(cRef, next.commission);
      return next;
    });
  }

  async listCommissions(q: Parameters<Repo['listCommissions']>[0]) {
    let query: Query = this.col(C.commissions);
    if (q.uid) query = query.where('uid', '==', q.uid);
    else if (q.status) query = query.where('status', '==', q.status);
    else if (q.from || q.to) {
      if (q.from) query = query.where('createdAt', '>=', q.from);
      if (q.to) query = query.where('createdAt', '<', q.to);
    }
    const rows = await this.all<Commission>(query);
    return rows
      .filter((c) => (!q.status || c.status === q.status) && inRange(c.createdAt, q.from, q.to))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async approveDueCommissions(cutoffMs: number, nowIso: string) {
    const pending = await this.all<Commission>(this.col(C.commissions).where('status', '==', 'pending'));
    const due = pending.filter((c) => {
      const t = Date.parse(c.travelDate);
      return !Number.isNaN(t) && t < cutoffMs;
    });
    let moved = 0;
    for (let i = 0; i < due.length; i += 200) {
      const chunk = due.slice(i, i + 200);
      moved += await this.db.runTransaction(async (tx) => {
        const refs = chunk.map((c) => this.col(C.commissions).doc(c.ref));
        const snaps = await tx.getAll(...refs);
        let n = 0;
        snaps.forEach((s, idx) => {
          if (s.exists && (s.data() as Commission).status === 'pending') {
            tx.update(refs[idx], { status: 'payable', updatedAt: nowIso });
            n++;
          }
        });
        return n;
      });
    }
    return moved;
  }

  async createPayoutFromPayable(uid: string, build: (payable: Commission[]) => Payout | null) {
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(this.col(C.commissions).where('uid', '==', uid).where('status', '==', 'payable'));
      const payable = snap.docs.map((d) => d.data() as Commission);
      const payout = build(payable);
      if (!payout) return null;
      snap.docs.forEach((d) => tx.update(d.ref, { status: 'requested', payoutId: payout.id }));
      tx.set(this.col(C.payouts).doc(payout.id), payout);
      return payout;
    });
  }
  async settlePayout(id: string, action: 'paid' | 'rejected', nowIso: string) {
    const pRef = this.col(C.payouts).doc(id);
    return this.db.runTransaction(async (tx) => {
      const ps = await tx.get(pRef);
      if (!ps.exists) throw new HttpError(404, 'Payout not found');
      const p = ps.data() as Payout;
      if (p.status !== 'requested') throw new HttpError(409, 'Payout already processed');
      const refs = p.commissionRefs.map((r) => this.col(C.commissions).doc(r));
      const snaps = refs.length ? await tx.getAll(...refs) : [];
      snaps.forEach((s, i) => {
        if (!s.exists) return;
        if (action === 'paid') tx.update(refs[i], { status: 'paid', updatedAt: nowIso });
        else tx.update(refs[i], { status: 'payable', payoutId: FieldValue.delete(), updatedAt: nowIso });
      });
      const next: Payout = { ...p, status: action, ...(action === 'paid' ? { paidAt: nowIso } : {}) };
      tx.update(pRef, action === 'paid' ? { status: 'paid', paidAt: nowIso } : { status: 'rejected' });
      return next;
    });
  }
  async listPayouts(q: Parameters<Repo['listPayouts']>[0]) {
    let query: Query = this.col(C.payouts);
    if (q.uid) query = query.where('uid', '==', q.uid);
    else if (q.status) query = query.where('status', '==', q.status);
    const rows = await this.all<Payout>(query);
    return rows.filter((p) => !q.status || p.status === q.status).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  async getSettings() {
    const s = await this.col(C.settings).doc('tiers').get();
    return s.exists ? (s.data() as Settings) : null;
  }
  async putSettings(s: Settings) {
    await this.col(C.settings).doc('tiers').set(s);
  }
}
