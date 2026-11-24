import type { AdminAffiliate, Booking, Commission, CommissionStatus, MyPackage, Payout, Pkg, Settings } from '../types';

export const UID_AFFILIATE = 'demo-affiliate';
export const UID_ADMIN = 'demo-admin';
export const UID_PENDING = 'demo-pending';

export type DbCommission = Commission & { uid: string; code: string; payoutId?: string };
export type DbPayout = Payout & { commissionRefs: string[] };

export interface Db {
  version: number;
  affiliates: AdminAffiliate[];
  myPackages: Record<string, MyPackage[]>;
  commissions: DbCommission[];
  payouts: DbPayout[];
  bookings: Booking[];
  settings: Settings;
}

export const DB_VERSION = 3;

export const PACKAGES: Pkg[] = [
  { id: 'PKG-BORACAY', name: 'Boracay Escape 4D3N', days: 4, price: 18900, destination: 'Boracay, Aklan' },
  { id: 'PKG-PALAWAN', name: 'El Nido & Coron Adventure 5D4N', days: 5, price: 27500, destination: 'Palawan' },
  { id: 'PKG-SIARGAO', name: 'Siargao Surf Getaway 4D3N', days: 4, price: 21800, destination: 'Siargao, Surigao del Norte' },
  { id: 'PKG-CEBU', name: 'Cebu & Bohol Highlights 4D3N', days: 4, price: 16200, destination: 'Cebu / Bohol' },
  { id: 'PKG-BANGKOK', name: 'Bangkok & Pattaya Value Tour 5D4N', days: 5, price: 24900, destination: 'Thailand' },
  { id: 'PKG-HONGKONG', name: 'Hong Kong & Macau Express 4D3N', days: 4, price: 31500, destination: 'Hong Kong' },
];

const DAY = 86400000;
const daysAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString();
const monthStart = (i: number): string => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 9 + i).toISOString();
};

export function seed(): Db {
  const affiliates: AdminAffiliate[] = [
    { uid: UID_AFFILIATE, email: 'maria.santos@example.com', name: 'Maria Santos', role: 'affiliate', status: 'active', code: 'MARIA24', tier: 'Silver', phone: '0917 555 1234', promoChannel: 'Facebook page: Travel with Maria', payout: { method: 'gcash', gcashNumber: '09175551234' }, createdAt: daysAgo(200) },
    { uid: UID_ADMIN, email: 'admin@example.com', name: 'Demo Admin', role: 'admin', status: 'active', tier: 'Bronze', createdAt: daysAgo(300) },
    { uid: UID_PENDING, email: 'new.applicant@example.com', name: 'Nina Applicant', role: 'affiliate', status: 'pending', tier: 'Bronze', promoChannel: 'TikTok @ninatravels', createdAt: daysAgo(1) },
    { uid: 'aff-juan', email: 'juan.delacruz@example.com', name: 'Juan Dela Cruz', role: 'affiliate', status: 'active', code: 'JUAN07', tier: 'Bronze', promoChannel: 'Barkada group chats', payout: { method: 'bank', bankName: 'BDO', accountName: 'Juan Dela Cruz', accountNumber: '0012345678' }, createdAt: daysAgo(90) },
    { uid: 'aff-pending-1', email: 'carlo.reyes@example.com', name: 'Carlo Reyes', role: 'affiliate', status: 'pending', tier: 'Bronze', promoChannel: 'YouTube travel vlog', createdAt: daysAgo(3) },
    { uid: 'aff-pending-2', email: 'liza.tan@example.com', name: 'Liza Tan', role: 'affiliate', status: 'pending', tier: 'Bronze', promoChannel: 'Instagram @lizaexplores', createdAt: daysAgo(2) },
    { uid: 'aff-gold', email: 'paolo.rivera@example.com', name: 'Paolo Rivera', role: 'affiliate', status: 'active', code: 'PAOLO88', tier: 'Gold', promoChannel: 'Travel blog', createdAt: daysAgo(320) },
    { uid: 'aff-silver', email: 'trisha.lopez@example.com', name: 'Trisha Lopez', role: 'affiliate', status: 'active', code: 'TRISHA15', tier: 'Silver', promoChannel: 'Instagram', createdAt: daysAgo(260) },
    { uid: 'aff-bronze1', email: 'migs.ramos@example.com', name: 'Migs Ramos', role: 'affiliate', status: 'active', code: 'MIGS21', tier: 'Bronze', promoChannel: 'Facebook group', createdAt: daysAgo(45) },
    { uid: 'aff-bronze2', email: 'dara.chua@example.com', name: 'Dara Chua', role: 'affiliate', status: 'active', code: 'DARA09', tier: 'Bronze', promoChannel: 'TikTok', createdAt: daysAgo(20) },
    { uid: 'aff-susp', email: 'rico.go@example.com', name: 'Rico Go', role: 'affiliate', status: 'suspended', code: 'RICO11', tier: 'Bronze', createdAt: daysAgo(150) },
  ];

  // [booking amount, status, created days ago (negative = this month), travel days from now, package index]
  const spec: [number, CommissionStatus, number, number, number][] = [
    [18900, 'paid', 150, -120, 0],
    [27500, 'paid', 120, -90, 1],
    [16200, 'paid', 95, -70, 3],
    [21800, 'payable', 40, -15, 2],
    [24900, 'payable', 35, -12, 4],
    [31500, 'payable', 30, -10, 5],
    [18900, 'requested', 25, -9, 0],
    [16200, 'requested', 22, -8, 3],
    [27500, 'reversed', 50, -30, 1],
    [18900, 'pending', 12, -5, 0],
    [21800, 'pending', 8, -3, 2],
    [24900, 'pending', -1, 20, 4],
    [31500, 'pending', -2, 40, 5],
  ];
  const commissions: DbCommission[] = spec.map(([amount, status, created, travel, pi], i) => {
    const createdAt = created < 0 ? monthStart(i) : daysAgo(created);
    const rate = created > 100 ? 5 : 7;
    return {
      ref: `LH-${2400 + i}`,
      uid: UID_AFFILIATE,
      code: 'MARIA24',
      packageName: PACKAGES[pi].name,
      amount,
      rate,
      commission: Math.round((amount * rate) / 100),
      status,
      travelDate: new Date(Date.now() + travel * DAY).toISOString(),
      createdAt,
      payoutId: status === 'requested' ? 'pay-2' : status === 'paid' ? 'pay-1' : undefined,
    };
  });

  const names = ['Ana Villanueva', 'Ben Ocampo', 'Cathy Lim', 'Dennis Cruz', 'Ella Mercado', 'Francis Uy', 'Grace Pineda', 'Harold Sy', 'Irene Bautista', 'Jomar Aquino', 'Kim Navarro', 'Leah Domingo', 'Marco Tolentino'];
  const bookings: Booking[] = commissions.map((c, i) => {
    const pkg = PACKAGES.find((p) => p.name === c.packageName)!;
    return {
      ref: c.ref,
      packageId: pkg.id,
      packageName: pkg.name,
      customerName: names[i % names.length],
      travelDate: c.travelDate,
      amount: c.amount,
      status: c.status === 'reversed' ? 'cancelled' : 'confirmed',
      source: 'affiliate',
      channelSite: 'lakbayhub.com',
      affiliateCode: 'MARIA24',
      affiliateUid: UID_AFFILIATE,
      createdAt: c.createdAt,
      updatedAt: c.createdAt,
    };
  });
  const extra: [number, Booking['source'], Booking['status'], number, number, string?][] = [
    [18900, 'b2c', 'confirmed', 0, 0],
    [27500, 'b2c', 'confirmed', 1, 1],
    [31500, 'b2c', 'pending', 2, 5],
    [16200, 'b2c', 'cancelled', 20, 3],
    [21800, 'b2b', 'confirmed', 0, 2, 'Sunrise Travel Agency'],
    [24900, 'b2b', 'confirmed', 1, 4, 'Island Hoppers Corp'],
    [31500, 'b2b', 'confirmed', 12, 5, 'Sunrise Travel Agency'],
    [18900, 'b2b', 'pending', 3, 0, 'Metro Tours & Travel'],
    [21800, 'admin', 'confirmed', 3, 2],
    [24900, 'admin', 'confirmed', 45, 4],
    [18900, 'affiliate', 'pending', 4, 0],
  ];
  extra.forEach(([amount, source, status, ago, pi, site], i) => {
    const pkg = PACKAGES[pi];
    const createdAt = ago < 5 ? monthStart(20 + i) : daysAgo(ago);
    bookings.push({
      ref: `LH-${2500 + i}`,
      packageId: pkg.id,
      packageName: pkg.name,
      customerName: names[(i + 5) % names.length],
      travelDate: new Date(Date.now() + (30 - i * 7) * DAY).toISOString(),
      amount,
      status,
      source,
      channelSite: site ?? (source === 'b2c' ? 'lakbayhub.com' : undefined),
      affiliateCode: source === 'affiliate' ? 'JUAN07' : undefined,
      affiliateUid: source === 'affiliate' ? 'aff-juan' : undefined,
      createdAt,
      updatedAt: createdAt,
    });
  });

  const sum = (st: CommissionStatus) => commissions.filter((c) => c.status === st).reduce((a, c) => a + c.commission, 0);
  const refs = (st: CommissionStatus) => commissions.filter((c) => c.status === st).map((c) => c.ref);
  const payouts: DbPayout[] = [
    { id: 'pay-1', uid: UID_AFFILIATE, affiliateName: 'Maria Santos', amount: sum('paid'), method: 'gcash', status: 'paid', requestedAt: daysAgo(80), paidAt: daysAgo(75), commissionRefs: refs('paid') },
    { id: 'pay-2', uid: UID_AFFILIATE, affiliateName: 'Maria Santos', amount: sum('requested'), method: 'gcash', status: 'requested', requestedAt: daysAgo(4), commissionRefs: refs('requested') },
    { id: 'pay-3', uid: 'aff-juan', affiliateName: 'Juan Dela Cruz', amount: 1450, method: 'bank', status: 'requested', requestedAt: daysAgo(2), commissionRefs: [] },
  ];

  return {
    version: DB_VERSION,
    affiliates,
    myPackages: {
      [UID_AFFILIATE]: PACKAGES.slice(0, 3).map((p, i) => ({ packageId: p.id, packageName: p.name, addedAt: daysAgo(60 - i) })),
    },
    commissions,
    payouts,
    bookings,
    settings: {
      tiers: [
        { name: 'Bronze', rate: 5, minBookings: 0 },
        { name: 'Silver', rate: 7, minBookings: 10 },
        { name: 'Gold', rate: 10, minBookings: 25 },
        { name: 'Platinum', rate: 12, minBookings: 50 },
      ],
      approvalWindowDays: 7,
      minPayout: 1000,
      attributionDays: 60,
    },
  };
}
