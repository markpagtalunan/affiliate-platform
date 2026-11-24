import type {
  Affiliate, AffiliatePackage, Booking, BookingSource, BookingStatus, Click, Commission, CommissionStatus, Payout, PayoutStatus, Settings,
} from '../types.js';

/** Thrown by repo/services for expected failures; mapped to HTTP status by the error middleware. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface BookingState {
  booking?: Booking;
  commission?: Commission;
}

export interface Repo {
  // affiliates
  getAffiliate(uid: string): Promise<Affiliate | null>;
  getAffiliateByCode(code: string): Promise<Affiliate | null>;
  createAffiliateIfAbsent(a: Affiliate): Promise<{ created: boolean; affiliate: Affiliate }>;
  updateAffiliate(uid: string, patch: Partial<Affiliate>): Promise<Affiliate | null>;
  listAffiliates(): Promise<Affiliate[]>;
  /** Atomically reserve a referral code; false if already taken. */
  claimCode(code: string, uid: string): Promise<boolean>;

  // saved packages
  listMyPackages(uid: string): Promise<AffiliatePackage[]>;
  addMyPackage(uid: string, packageId: string, packageName: string): Promise<void>;
  removeMyPackage(uid: string, packageId: string): Promise<void>;

  // clicks (from inclusive, to exclusive; ISO strings)
  addClick(c: Click): Promise<void>;
  listClicks(q: { from: string; to: string; uid?: string }): Promise<Click[]>;

  // bookings
  getBooking(ref: string): Promise<Booking | null>;
  listBookings(q: { from?: string; to?: string; uid?: string; source?: BookingSource; status?: BookingStatus }): Promise<Booking[]>;
  /** Atomically read booking+commission, let fn compute the new state, and write both. */
  processBooking(ref: string, fn: (cur: BookingState) => BookingState & { booking: Booking }): Promise<BookingState & { booking: Booking }>;

  // commissions
  listCommissions(q: { uid?: string; status?: CommissionStatus; from?: string; to?: string }): Promise<Commission[]>;
  /** Moves pending commissions whose travelDate < cutoffMs to payable. Returns count moved. */
  approveDueCommissions(cutoffMs: number, nowIso: string): Promise<number>;

  // payouts
  /**
   * Atomically load the uid's payable commissions, let `build` produce a payout (or throw HttpError / return null for none),
   * mark those commissions `requested` with payoutId, and store the payout.
   */
  createPayoutFromPayable(uid: string, build: (payable: Commission[]) => Payout | null): Promise<Payout | null>;
  /** Atomically move a `requested` payout to paid/rejected and its commissions to paid/payable. */
  settlePayout(id: string, action: 'paid' | 'rejected', nowIso: string): Promise<Payout>;
  listPayouts(q: { uid?: string; status?: PayoutStatus }): Promise<Payout[]>;

  // settings
  getSettings(): Promise<Settings | null>;
  putSettings(s: Settings): Promise<void>;
}
