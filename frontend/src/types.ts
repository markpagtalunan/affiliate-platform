export type Role = 'admin' | 'affiliate';
export type AffiliateStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
export type PayoutMethod = 'gcash' | 'bank';

export interface PayoutDetails {
  method: PayoutMethod;
  gcashNumber?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
}

export interface Me {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  role: Role;
  status: AffiliateStatus;
  code?: string;
  tier: Tier;
  payout?: PayoutDetails;
  phone?: string;
  promoChannel?: string;
}

export interface AdminAffiliate extends Me {
  createdAt: string;
}

export interface Pkg {
  id: string;
  name: string;
  days: number;
  price: number;
  image?: string;
  destination?: string;
}

export interface MyPackage {
  packageId: string;
  packageName: string;
  addedAt: string;
}

export type CommissionStatus = 'pending' | 'payable' | 'requested' | 'paid' | 'reversed';

export interface Commission {
  ref: string;
  packageName: string;
  amount: number;
  rate: number;
  commission: number;
  status: CommissionStatus;
  travelDate: string;
  createdAt: string;
}

export type PayoutStatus = 'requested' | 'paid' | 'rejected';

export interface Payout {
  id: string;
  uid: string;
  affiliateName: string;
  amount: number;
  method: PayoutMethod;
  status: PayoutStatus;
  requestedAt: string;
  paidAt?: string;
}

export type BookingSource = 'b2c' | 'b2b' | 'affiliate' | 'admin';

export interface Booking {
  ref: string;
  packageId: string;
  packageName: string;
  customerName: string;
  travelDate: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  source: BookingSource;
  channelSite?: string;
  affiliateCode?: string;
  affiliateUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateDashboard {
  clicks30d: number;
  bookings30d: number;
  conversionPct: number;
  earnedThisMonth: number;
  bars: { month: string; value: number }[];
  funnel: { clicks: number; bookings: number };
  tier: {
    name: Tier;
    rate: number;
    bookingsThisQuarter: number;
    nextTier?: { name: Tier; rate: number; minBookings: number };
  };
  recent: Commission[];
}

export interface PayoutsResponse {
  balance: { payable: number; pending: number; requested: number; paid: number };
  items: Payout[];
}

export interface AdminDashboard {
  bookingsThisMonth: number;
  revenueThisMonth: number;
  affiliateSharePct: number;
  /** Per-source breakdown for the current month (optional: derived client-side if absent). */
  bySource?: Partial<Record<BookingSource, { bookings: number; revenue: number }>>;
  activeAffiliates: number;
  pendingAffiliates: number;
  commissionLiability: number;
  pendingPayouts: number;
}

export interface TierSetting {
  name: Tier;
  rate: number;
  minBookings: number;
}

export interface Settings {
  tiers: TierSetting[];
  approvalWindowDays: number;
  minPayout: number;
  attributionDays: number;
}

/* ---------- Analytics ---------- */
export type Range = '7d' | '30d' | '90d' | '12m';
export type Channel = 'facebook' | 'messenger' | 'whatsapp' | 'direct' | 'other';

export interface AffKpis {
  clicks: number;
  bookings: number;
  conversionPct: number;
  earned: number;
  avgBookingValue: number;
}

export interface AffiliateAnalytics {
  range: Range;
  kpis: AffKpis;
  previous: AffKpis;
  series: { date: string; clicks: number; bookings: number; earned: number }[];
  funnel: { clicks: number; startedBooking: number; paid: number };
  byPackage: { packageId: string; name: string; clicks: number; bookings: number; conversionPct: number; earned: number }[];
  byChannel: { channel: Channel; clicks: number; bookings: number }[];
  commissionByStatus: Record<CommissionStatus, number>;
  tier: AffiliateDashboard['tier'];
}

export interface AdminKpis {
  revenue: number;
  bookings: number;
  conversionPct: number;
  activeAffiliates: number;
  newAffiliates: number;
  affiliateSharePct: number;
  commissionAccrued: number;
  commissionPaid: number;
}

export type SourcePoint = { date: string } & Record<BookingSource, number>;

export interface AdminAnalytics {
  range: Range;
  kpis: AdminKpis;
  previous: AdminKpis;
  series: SourcePoint[];
  bookingsSeries: SourcePoint[];
  bySource: { source: BookingSource; bookings: number; revenue: number }[];
  topAffiliates: { uid: string; name: string; code: string; tier: Tier; clicks: number; bookings: number; revenue: number; commission: number; conversionPct: number }[];
  topPackages: { packageId: string; name: string; bookings: number; revenue: number; affiliateBookings: number }[];
  affiliateGrowth: { date: string; total: number }[];
  tierDistribution: { tier: Tier; count: number }[];
  payouts: { requestedAmount: number; paidAmount: number; liability: number };
}
