import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../config/env.js';
import { cached, type Cache } from '../config/valkey.js';
import { HttpError, type Repo } from '../repo/index.js';
import {
  CHANNELS, DEFAULT_SETTINGS, type Affiliate, type AuthUser, type Booking, type Channel, type Commission, type Me, type Payout, type PayoutDetails, type Settings, type Tier,
} from '../types.js';
import { DAY, iso, startOfLocalQuarter } from '../util/time.js';
import type { Notifier } from './email.js';

export const settingsSchema = z.object({
  tiers: z
    .array(z.object({ name: z.enum(['Bronze', 'Silver', 'Gold', 'Platinum']), rate: z.number().min(0).max(100), minBookings: z.number().int().min(0).max(100000) }).strict())
    .min(1)
    .max(8),
  approvalWindowDays: z.number().int().min(0).max(365),
  minPayout: z.number().int().min(0).max(10_000_000),
  attributionDays: z.number().int().min(1).max(365),
});

export const toMe = (a: Affiliate, isAdmin = a.role === 'admin'): Me => ({
  uid: a.uid, email: a.email, name: a.name, photoURL: a.photoURL, role: isAdmin ? 'admin' : 'affiliate', status: a.status, code: a.code, tier: a.tier,
  payout: a.payout, phone: a.phone, promoChannel: a.promoChannel,
});

export const publicCommission = (c: Commission) => ({
  ref: c.ref, packageName: c.packageName, amount: c.amount, rate: c.rate, commission: c.commission, status: c.status, travelDate: c.travelDate, createdAt: c.createdAt,
});

export const publicPayout = (p: Payout) => ({
  id: p.id, uid: p.uid, affiliateName: p.affiliateName, amount: p.amount, method: p.method, status: p.status, requestedAt: p.requestedAt, paidAt: p.paidAt,
});

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
export const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 1000) / 10 : 0);

export interface BookingInput {
  ref: string;
  packageId: string;
  packageName: string;
  customerName: string;
  travelDate: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  affiliateCode?: string | null;
  source?: 'b2c' | 'b2b' | 'affiliate' | 'admin';
  channelSite?: string;
  src?: string;
}

export function normalizeChannel(v: unknown): Channel | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  const s = v.toLowerCase();
  return (CHANNELS as string[]).includes(s) ? (s as Channel) : 'other';
}

export class CoreService {
  constructor(private config: Config, private repo: Repo, private cache: Cache, private notifier: Notifier) {}

  /* ---------- settings / tiers ---------- */

  async getSettings(): Promise<Settings> {
    return cached(this.cache, 'settings:tiers', 300, async () => (await this.repo.getSettings()) ?? DEFAULT_SETTINGS);
  }

  async putSettings(input: Settings): Promise<Settings> {
    const s: Settings = { ...input, tiers: [...input.tiers].sort((a, b) => a.minBookings - b.minBookings) };
    await this.repo.putSettings(s);
    await this.cache.del('settings:tiers');
    return s;
  }

  tierInfo(tier: Tier, settings: Settings, bookingsThisQuarter: number) {
    const tiers = settings.tiers;
    const idx = Math.max(0, tiers.findIndex((t) => t.name === tier));
    const cur = tiers[idx] ?? tiers[0];
    const next = tiers[idx + 1];
    return {
      name: cur.name,
      rate: cur.rate,
      bookingsThisQuarter,
      nextTier: next ? { name: next.name, rate: next.rate, minBookings: next.minBookings } : undefined,
    };
  }

  async confirmedThisQuarter(uid: string): Promise<number> {
    const from = startOfLocalQuarter(Date.now(), this.config.tzOffsetMinutes);
    const list = await this.repo.listBookings({ uid, status: 'confirmed', from: iso(from) });
    return list.length;
  }

  async recomputeTier(uid: string): Promise<void> {
    const [aff, settings, count] = await Promise.all([this.repo.getAffiliate(uid), this.getSettings(), this.confirmedThisQuarter(uid)]);
    if (!aff) return;
    const eligible = [...settings.tiers].sort((a, b) => b.minBookings - a.minBookings).find((t) => count >= t.minBookings) ?? settings.tiers[0];
    if (eligible.name !== aff.tier) await this.repo.updateAffiliate(uid, { tier: eligible.name });
  }

  /* ---------- affiliates ---------- */

  async createSession(user: AuthUser): Promise<Me> {
    const now = new Date().toISOString();
    const fresh: Affiliate = {
      uid: user.uid,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      photoURL: user.photoURL,
      role: user.isAdmin ? 'admin' : 'affiliate',
      status: user.isAdmin ? 'active' : 'pending',
      tier: 'Bronze',
      createdAt: now,
      ...(user.isAdmin ? { approvedAt: now } : {}),
    };
    const { created, affiliate } = await this.repo.createAffiliateIfAbsent(fresh);
    if (created) {
      if (!user.isAdmin) this.notifier.applicationReceived(affiliate);
      return toMe(affiliate, user.isAdmin);
    }
    if (user.isAdmin && (affiliate.status !== 'active' || affiliate.role !== 'admin')) {
      const upd = await this.repo.updateAffiliate(user.uid, { status: 'active', role: 'admin' });
      return toMe(upd ?? affiliate, true);
    }
    return toMe(affiliate, user.isAdmin);
  }

  async generateCode(uid: string, name: string): Promise<string> {
    const base = (name.split(/\s+/)[0] || 'AFF').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8) || 'AFF';
    for (let i = 0; i < 30; i++) {
      const digits = i < 20 ? 2 : 4;
      const n = Math.floor(10 ** (digits - 1) + Math.random() * 9 * 10 ** (digits - 1));
      const code = `${base}${n}`;
      if (await this.repo.claimCode(code, uid)) return code;
    }
    for (;;) {
      const code = `${base}${randomBytes(3).toString('hex').toUpperCase()}`;
      if (await this.repo.claimCode(code, uid)) return code;
    }
  }

  async approveAffiliate(uid: string): Promise<void> {
    const aff = await this.repo.getAffiliate(uid);
    if (!aff) throw new HttpError(404, 'Affiliate not found');
    const wasActive = aff.status === 'active';
    const code = aff.code ?? (await this.generateCode(uid, aff.name));
    await this.repo.updateAffiliate(uid, { status: 'active', tier: aff.tier ?? 'Bronze', code, approvedAt: aff.approvedAt ?? new Date().toISOString() });
    if (!wasActive) this.notifier.approved(aff, code);
  }

  async setAffiliateStatus(uid: string, status: 'rejected' | 'suspended'): Promise<void> {
    const aff = await this.repo.getAffiliate(uid);
    if (!aff) throw new HttpError(404, 'Affiliate not found');
    if (aff.role === 'admin') throw new HttpError(400, 'Cannot change an admin account');
    await this.repo.updateAffiliate(uid, { status });
  }

  /* ---------- bookings / commissions ---------- */

  async handleBooking(input: BookingInput): Promise<{ booking: Booking; commission?: Commission }> {
    const now = new Date().toISOString();
    const pre = await this.repo.getBooking(input.ref);
    const code = input.affiliateCode?.trim().toUpperCase() || undefined;

    // Attribution is sticky: an already-attributed booking keeps its affiliate. New attribution only to ACTIVE affiliates.
    let affiliate: Affiliate | null = null;
    if (pre?.affiliateUid) affiliate = await this.repo.getAffiliate(pre.affiliateUid);
    else if (code) {
      const found = await this.repo.getAffiliateByCode(code);
      if (found && found.status === 'active' && found.role === 'affiliate') affiliate = found;
    }
    const settings = await this.getSettings();
    const rate = affiliate ? (settings.tiers.find((t) => t.name === affiliate!.tier)?.rate ?? settings.tiers[0].rate) : 0;
    const affiliateActive = affiliate?.status === 'active';

    const result = await this.repo.processBooking(input.ref, ({ booking: ex, commission: exC }) => {
      const attributed = ex?.affiliateUid ?? affiliate?.uid;
      const attributedCode = ex?.affiliateCode ?? affiliate?.code;
      const source: Booking['source'] = attributed ? 'affiliate' : input.source && input.source !== 'affiliate' ? input.source : ex?.source && ex.source !== 'affiliate' ? ex.source : 'b2c';
      const booking: Booking = {
        ref: input.ref,
        packageId: input.packageId,
        packageName: input.packageName,
        customerName: input.customerName,
        travelDate: input.travelDate,
        amount: input.amount,
        status: input.status,
        source,
        channelSite: input.channelSite ?? ex?.channelSite,
        channel: normalizeChannel(input.src) ?? ex?.channel,
        affiliateCode: attributedCode,
        affiliateUid: attributed,
        createdAt: ex?.createdAt ?? now,
        updatedAt: now,
      };
      let commission = exC;
      if (input.status === 'confirmed' && attributed && affiliate && affiliate.uid === attributed && affiliateActive) {
        if (!exC) {
          commission = {
            ref: input.ref, uid: attributed, code: attributedCode ?? '', packageName: input.packageName, amount: input.amount, rate,
            commission: Math.round((input.amount * rate) / 100), status: 'pending', travelDate: input.travelDate, createdAt: now, updatedAt: now,
          };
        } else if (exC.status === 'reversed') {
          commission = { ...exC, packageName: input.packageName, amount: input.amount, rate, commission: Math.round((input.amount * rate) / 100), travelDate: input.travelDate, status: 'pending', updatedAt: now };
        }
      } else if (input.status === 'cancelled' && exC && (exC.status === 'pending' || exC.status === 'payable')) {
        // Commissions already locked in a payout (requested/paid) are not auto-reversed: that needs a manual clawback.
        commission = { ...exC, status: 'reversed', updatedAt: now };
      }
      return { booking, commission };
    });

    const uid = result.booking.affiliateUid;
    if (uid) await this.recomputeTier(uid);
    return result;
  }

  async runApprovals(): Promise<number> {
    const s = await this.getSettings();
    return this.repo.approveDueCommissions(Date.now() - s.approvalWindowDays * DAY, new Date().toISOString());
  }

  /* ---------- payouts ---------- */

  private detailsComplete(d: PayoutDetails | undefined, method: 'gcash' | 'bank'): d is PayoutDetails {
    if (!d || d.method !== method) return false;
    return method === 'gcash' ? !!d.gcashNumber : !!(d.bankName && d.accountName && d.accountNumber);
  }

  async requestPayout(me: Affiliate, method: 'gcash' | 'bank'): Promise<Payout> {
    if (!this.detailsComplete(me.payout, method)) throw new HttpError(400, 'Save your payout details in Settings first');
    const details = me.payout as PayoutDetails;
    const settings = await this.getSettings();
    const payout = await this.repo.createPayoutFromPayable(me.uid, (payable) => {
      const total = sum(payable.map((c) => c.commission));
      if (!payable.length || total < settings.minPayout) throw new HttpError(400, `Minimum payout is PHP ${settings.minPayout.toLocaleString('en-US')}`);
      return {
        id: randomUUID(), uid: me.uid, affiliateName: me.name, amount: total, method, details: { ...details },
        commissionRefs: payable.map((c) => c.ref), status: 'requested', requestedAt: new Date().toISOString(),
      };
    });
    if (!payout) throw new HttpError(400, 'No payable commissions');
    this.notifier.payoutRequested(me, payout);
    return payout;
  }

  async settlePayout(id: string, action: 'paid' | 'rejected'): Promise<void> {
    const p = await this.repo.settlePayout(id, action, new Date().toISOString());
    if (action === 'paid') {
      const aff = await this.repo.getAffiliate(p.uid);
      if (aff) this.notifier.payoutPaid(aff, p);
    }
  }
}

export function csvCell(v: string | number | undefined): string {
  let s = v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function payoutsCsv(payouts: Payout[]): string {
  const rows = [['id', 'affiliate', 'amount', 'method', 'account', 'status', 'requestedAt', 'paidAt'].join(',')];
  for (const p of payouts) {
    const d = p.details;
    const account = p.method === 'gcash' ? (d.gcashNumber ?? '') : [d.bankName, d.accountName, d.accountNumber].filter(Boolean).join(' / ');
    rows.push([p.id, p.affiliateName, p.amount, p.method, account, p.status, p.requestedAt, p.paidAt].map(csvCell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}
