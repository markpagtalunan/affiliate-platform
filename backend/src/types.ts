export type Role = 'admin' | 'affiliate';
export type AffiliateStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
export type PayoutMethod = 'gcash' | 'bank';
export type BookingSource = 'b2c' | 'b2b' | 'affiliate' | 'admin';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
export type CommissionStatus = 'pending' | 'payable' | 'requested' | 'paid' | 'reversed';
export type PayoutStatus = 'requested' | 'paid' | 'rejected';
export type Range = '7d' | '30d' | '90d' | '12m';
export type Channel = 'facebook' | 'messenger' | 'whatsapp' | 'direct' | 'other';

export const TIERS: Tier[] = ['Bronze', 'Silver', 'Gold', 'Platinum'];
export const SOURCES: BookingSource[] = ['b2c', 'b2b', 'affiliate', 'admin'];
export const CHANNELS: Channel[] = ['facebook', 'messenger', 'whatsapp', 'direct', 'other'];

export interface PayoutDetails {
  method: PayoutMethod;
  gcashNumber?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
}

export interface Affiliate {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  role: Role;
  status: AffiliateStatus;
  code?: string;
  tier: Tier;
  phone?: string;
  promoChannel?: string;
  payout?: PayoutDetails;
  createdAt: string;
  approvedAt?: string;
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

export interface AffiliatePackage {
  packageId: string;
  packageName: string;
  addedAt: string;
}

export interface Click {
  id: string;
  code: string;
  uid: string;
  packageId?: string;
  src?: Channel;
  ts: string;
  ipHash: string;
}

export interface Booking {
  ref: string;
  packageId: string;
  packageName: string;
  customerName: string;
  travelDate: string;
  amount: number;
  status: BookingStatus;
  source: BookingSource;
  channelSite?: string;
  channel?: Channel;
  affiliateCode?: string;
  affiliateUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Commission {
  ref: string;
  uid: string;
  code: string;
  packageName: string;
  amount: number;
  rate: number;
  commission: number;
  status: CommissionStatus;
  travelDate: string;
  payoutId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payout {
  id: string;
  uid: string;
  affiliateName: string;
  amount: number;
  method: PayoutMethod;
  details: PayoutDetails;
  commissionRefs: string[];
  status: PayoutStatus;
  requestedAt: string;
  paidAt?: string;
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

export const DEFAULT_SETTINGS: Settings = {
  tiers: [
    { name: 'Bronze', rate: 5, minBookings: 0 },
    { name: 'Silver', rate: 7, minBookings: 10 },
    { name: 'Gold', rate: 10, minBookings: 25 },
    { name: 'Platinum', rate: 12, minBookings: 50 },
  ],
  approvalWindowDays: 7,
  minPayout: 1000,
  attributionDays: 60,
};

export interface Pkg {
  id: string;
  name: string;
  days: number;
  price: number;
  image?: string;
  destination?: string;
}

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
      affiliate?: Affiliate;
    }
  }
}
