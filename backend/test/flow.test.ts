import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { MemoryCache, NoopCache } from '../src/config/valkey.js';
import { devVerifier } from '../src/middleware/auth.js';
import { MemoryRepo } from '../src/repo/memory.js';
import { csvCell } from '../src/services/core.js';
import type { MailMessage, Mailer } from '../src/services/email.js';
import { mapPackage } from '../src/services/packages.js';

const SECRET = 'test-secret';
const ADMIN = 'Bearer dev:boss@example.com:Boss';
const MARIA = 'Bearer dev:maria@example.com:Maria Santos';
const MARIO = 'Bearer dev:mario@example.com:Maria Cruz';

class RecMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(m: MailMessage) {
    this.sent.push(m);
  }
}

function setup(extra: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test', DATA_STORE: 'memory', AUTH_MODE: 'dev', ADMIN_EMAILS: 'boss@example.com', BOOKING_WEBHOOK_SECRET: SECRET,
    MOCK_PACKAGES: 'true', FRONTEND_ORIGIN: 'http://localhost:5173', ...extra,
  });
  const mailer = new RecMailer();
  const repo = new MemoryRepo();
  const cache = new MemoryCache();
  const app = createApp({ config, repo, cache, mailer, verifier: devVerifier() });
  return { app, mailer, repo, cache };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const booking = (ref: string, code: string | undefined, over: Record<string, unknown> = {}) => ({
  ref, packageId: 'sample-boracay', packageName: 'Boracay Beach Escape', customerName: 'Juan', travelDate: daysAgo(30), amount: 10000,
  status: 'confirmed', affiliateCode: code, ...over,
});

describe('affiliate platform flow', () => {
  let t: ReturnType<typeof setup>;
  let code = '';
  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, auth?: string) => {
    const r = request(t.app)[m](`/api/v1${path}`);
    return auth ? r.set('Authorization', auth) : r;
  };
  const hook = (body: unknown, secret = SECRET) => request(t.app).post('/api/v1/webhooks/bookings').set('x-webhook-secret', secret).send(body as object);

  beforeEach(async () => {
    t = setup();
  });

  async function onboard() {
    await api('post', '/auth/session', ADMIN).expect(200);
    const me = await api('post', '/auth/session', MARIA).expect(200);
    expect(me.body.status).toBe('pending');
    expect(me.body.role).toBe('affiliate');
    const list = await api('get', '/admin/affiliates?status=pending', ADMIN).expect(200);
    const uid = list.body.items[0].uid as string;
    await api('post', `/admin/affiliates/${uid}/approve`, ADMIN).expect(200);
    const after = await api('get', '/me', MARIA).expect(200);
    code = after.body.code;
    return { uid, code };
  }

  it('runs the full lifecycle', async () => {
    // sign in -> pending, blocked
    const first = await api('post', '/auth/session', MARIA).expect(200);
    expect(first.body).toMatchObject({ status: 'pending', tier: 'Bronze', role: 'affiliate', email: 'maria@example.com' });
    expect(t.mailer.sent.some((m) => m.to[0] === 'maria@example.com' && /received/i.test(m.subject))).toBe(true);
    await api('get', '/packages', MARIA).expect(403);
    await api('get', '/dashboard', MARIA).expect(403);
    await api('get', '/payouts', MARIA).expect(403);
    await api('get', '/analytics/overview', MARIA).expect(403);
    await api('get', '/me', MARIA).expect(200);

    // admin approves, code generated and unique
    await api('post', '/auth/session', ADMIN).expect(200);
    const pend = await api('get', '/admin/affiliates?status=pending', ADMIN).expect(200);
    const uid = pend.body.items[0].uid as string;
    await api('post', `/admin/affiliates/${uid}/approve`, ADMIN).expect(200);
    const me = await api('get', '/me', MARIA).expect(200);
    expect(me.body.status).toBe('active');
    code = me.body.code;
    expect(code).toMatch(/^MARIA\d{2,}$/);
    const approvedMail = t.mailer.sent.find((m) => /approved/i.test(m.subject));
    expect(approvedMail?.html).toContain(code);

    await api('post', '/auth/session', MARIO).expect(200);
    const uid2 = (await api('get', '/admin/affiliates?status=pending', ADMIN)).body.items[0].uid as string;
    await api('post', `/admin/affiliates/${uid2}/approve`, ADMIN).expect(200);
    const code2 = (await api('get', '/me', MARIO)).body.code as string;
    expect(code2).not.toBe(code);

    await api('get', '/packages', MARIA).expect(200).expect((r) => expect(r.body.items).toHaveLength(6));
    expect((await api('get', `/track/validate/${code}`)).body).toEqual({ valid: true });
    expect((await api('get', '/track/validate/NOPE99')).body).toEqual({ valid: false });

    // clicks with src
    await api('post', '/track/click').send({ code, packageId: 'sample-boracay', src: 'facebook' }).expect(200);
    await api('post', '/track/click').send({ code, src: 'whatsapp' }).expect(200);
    await api('post', '/track/click').send({ code: 'UNKNOWN1' }).expect(200);

    // webhook: confirmed -> Bronze 5%
    const w1 = await hook(booking('B-1', code)).expect(200);
    expect(w1.body.commission).toMatchObject({ rate: 5, commission: 500, status: 'pending' });
    // idempotent
    await hook(booking('B-1', code)).expect(200);
    let comms = await api('get', '/commissions', MARIA).expect(200);
    expect(comms.body.items).toHaveLength(1);
    expect(comms.body.items[0]).toMatchObject({ ref: 'B-1', amount: 10000, rate: 5, commission: 500, status: 'pending' });
    expect(Object.keys(comms.body.items[0]).sort()).toEqual(['amount', 'commission', 'createdAt', 'packageName', 'rate', 'ref', 'status', 'travelDate']);
    const bk = await api('get', '/admin/bookings?source=affiliate', ADMIN).expect(200);
    expect(bk.body.items).toHaveLength(1);

    // cancel reverses
    await hook(booking('B-1', code, { status: 'cancelled' })).expect(200);
    comms = await api('get', '/commissions', MARIA);
    expect(comms.body.items[0].status).toBe('reversed');

    // non-active code is not attributed
    const w2 = await hook(booking('B-X', 'UNKNOWN1')).expect(200);
    expect(w2.body.source).toBe('b2c');
    expect(w2.body.commission).toBeNull();

    // B-2: 500 -> approvals -> payable -> below min
    await hook(booking('B-2', code)).expect(200);
    await hook(booking('B-FUTURE', code, { travelDate: new Date(Date.now() + 5 * 86400000).toISOString() })).expect(200);
    const run = await api('post', '/admin/commissions/run-approvals', ADMIN).expect(200);
    expect(run.body.moved).toBe(1); // B-2 only (B-FUTURE travels later, B-1 reversed)
    await api('patch', '/me', MARIA).send({ payout: { method: 'gcash', gcashNumber: '09171234567' } }).expect(200);
    const tooLow = await api('post', '/payouts/request', MARIA).send({ method: 'gcash' });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.error).toMatch(/minimum/i);

    // another one -> 1000 total
    await hook(booking('B-3', code)).expect(200);
    await api('post', '/admin/commissions/run-approvals', ADMIN).expect(200);
    const bal = await api('get', '/payouts', MARIA).expect(200);
    expect(bal.body.balance).toMatchObject({ payable: 1000, pending: 500 });
    const wrongMethod = await api('post', '/payouts/request', MARIA).send({ method: 'bank' });
    expect(wrongMethod.status).toBe(400);
    const req = await api('post', '/payouts/request', MARIA).send({ method: 'gcash' }).expect(200);
    expect(req.body).toMatchObject({ amount: 1000, method: 'gcash', status: 'requested', affiliateName: 'Maria Santos' });
    expect(req.body.commissionRefs).toBeUndefined();
    expect(t.mailer.sent.some((m) => m.to[0] === 'boss@example.com' && /payout requested/i.test(m.subject))).toBe(true);
    const after = await api('get', '/payouts', MARIA);
    expect(after.body.balance).toMatchObject({ payable: 0, requested: 1000 });
    await api('post', '/payouts/request', MARIA).send({ method: 'gcash' }).expect(400); // nothing payable now

    // reject returns to payable, then request again, then mark paid
    await api('post', `/admin/payouts/${req.body.id}/reject`, ADMIN).expect(200);
    expect((await api('get', '/payouts', MARIA)).body.balance.payable).toBe(1000);
    await api('post', `/admin/payouts/${req.body.id}/mark-paid`, ADMIN).expect(409);
    const req2 = await api('post', '/payouts/request', MARIA).send({ method: 'gcash' }).expect(200);
    await api('post', `/admin/payouts/${req2.body.id}/mark-paid`, ADMIN).expect(200);
    expect((await api('get', '/payouts', MARIA)).body.balance).toMatchObject({ paid: 1000, payable: 0, requested: 0 });
    expect(t.mailer.sent.some((m) => m.to[0] === 'maria@example.com' && /payout/i.test(m.subject) && /sent/i.test(m.subject))).toBe(true);
    await api('post', `/admin/payouts/${req2.body.id}/mark-paid`, ADMIN).expect(409);

    // affiliate dashboard
    const dash = await api('get', '/dashboard', MARIA).expect(200);
    expect(dash.body).toMatchObject({ clicks30d: 2, bookings30d: 3, tier: { name: 'Bronze', rate: 5, bookingsThisQuarter: 3, nextTier: { name: 'Silver', rate: 7, minBookings: 10 } } });
    expect(dash.body.bars).toHaveLength(6);
    expect(dash.body.funnel).toEqual({ clicks: 2, bookings: 3 });
    expect(dash.body.recent.length).toBeGreaterThan(0);

    // affiliate analytics
    for (const range of ['7d', '30d', '90d', '12m']) {
      const a = await api('get', `/analytics/overview?range=${range}`, MARIA).expect(200);
      expect(a.body.range).toBe(range);
      expect(a.body.series).toHaveLength(range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 12);
      expect(Object.keys(a.body.previous).sort()).toEqual(Object.keys(a.body.kpis).sort());
    }
    const ov = (await api('get', '/analytics/overview', MARIA)).body;
    expect(ov.range).toBe('30d');
    expect(ov.kpis).toMatchObject({ clicks: 2, bookings: 3, earned: 1500 - 0 + 500 - 500 + 0, avgBookingValue: 10000 });
    expect(ov.previous).toEqual({ clicks: 0, bookings: 0, conversionPct: 0, earned: 0, avgBookingValue: 0 });
    expect(ov.funnel).toEqual({ clicks: 2, startedBooking: 3, paid: 3 });
    expect(ov.byChannel.map((c: { channel: string }) => c.channel)).toEqual(['facebook', 'messenger', 'whatsapp', 'direct', 'other']);
    expect(ov.byChannel.find((c: { channel: string }) => c.channel === 'facebook').clicks).toBe(1);
    expect(ov.byChannel.find((c: { channel: string }) => c.channel === 'whatsapp').clicks).toBe(1);
    expect(ov.byChannel.reduce((a: number, c: { bookings: number }) => a + c.bookings, 0)).toBe(3);
    expect(ov.byPackage[0]).toMatchObject({ packageId: 'sample-boracay', name: 'Boracay Beach Escape', bookings: 3 });
    expect(ov.commissionByStatus).toEqual({ pending: 500, payable: 0, requested: 0, paid: 1000, reversed: 500 });
    expect(ov.tier.name).toBe('Bronze');

    // admin dashboard + analytics
    const ad = (await api('get', '/admin/dashboard', ADMIN).expect(200)).body;
    expect(ad).toMatchObject({ activeAffiliates: 2, pendingAffiliates: 0, pendingPayouts: 0, commissionLiability: 500 });
    expect(ad.bySource.affiliate.bookings).toBeGreaterThan(0);
    const aa = (await api('get', '/admin/analytics?range=90d', ADMIN).expect(200)).body;
    expect(aa.range).toBe('90d');
    expect(aa.series).toHaveLength(90);
    expect(aa.bookingsSeries).toHaveLength(90);
    expect(aa.series[0]).toEqual({ date: expect.any(String), b2c: 0, b2b: 0, affiliate: 0, admin: 0 });
    expect(Object.keys(aa.kpis).sort()).toEqual(['activeAffiliates', 'affiliateSharePct', 'bookings', 'commissionAccrued', 'commissionPaid', 'conversionPct', 'newAffiliates', 'revenue']);
    expect(Object.keys(aa.previous).sort()).toEqual(Object.keys(aa.kpis).sort());
    expect(aa.kpis).toMatchObject({ bookings: 4, revenue: 40000, commissionPaid: 1000, affiliateSharePct: 75, newAffiliates: 2 });
    expect(aa.bySource.map((s: { source: string }) => s.source)).toEqual(['b2c', 'b2b', 'affiliate', 'admin']);
    expect(aa.bySource.find((s: { source: string }) => s.source === 'affiliate')).toEqual({ source: 'affiliate', bookings: 3, revenue: 30000 });
    expect(aa.topAffiliates[0]).toMatchObject({ uid, name: 'Maria Santos', code, tier: 'Bronze', clicks: 2, bookings: 3, revenue: 30000 });
    expect(aa.topPackages[0]).toMatchObject({ packageId: 'sample-boracay', bookings: 4, affiliateBookings: 3 });
    expect(aa.affiliateGrowth.at(-1)).toEqual({ date: expect.any(String), total: 2 });
    expect(aa.tierDistribution).toHaveLength(4);
    expect(aa.payouts).toEqual({ requestedAmount: 0, paidAmount: 1000, liability: 500 });

    // CSV
    const csv = await api('get', '/admin/payouts/export.csv', ADMIN).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n')[0]).toContain('id,affiliate,amount');
    expect(csv.text).toContain('Maria Santos');
  });

  it('empty state returns well-formed analytics', async () => {
    await onboard();
    const a = (await api('get', '/analytics/overview?range=12m', MARIA).expect(200)).body;
    expect(a.kpis).toEqual({ clicks: 0, bookings: 0, conversionPct: 0, earned: 0, avgBookingValue: 0 });
    expect(a.byPackage).toEqual([]);
    expect(a.series).toHaveLength(12);
    const ad = (await api('get', '/admin/analytics?range=7d', ADMIN).expect(200)).body;
    expect(ad.kpis.revenue).toBe(0);
    expect(ad.topPackages).toEqual([]);
    // invalid range falls back to 30d
    expect((await api('get', '/analytics/overview?range=zzz', MARIA)).body.range).toBe('30d');
  });

  it('upgrades tier from confirmed affiliate bookings this quarter and uses the tier rate', async () => {
    await onboard();
    await api('put', '/admin/settings', ADMIN)
      .send({ tiers: [{ name: 'Bronze', rate: 5, minBookings: 0 }, { name: 'Silver', rate: 7, minBookings: 2 }], approvalWindowDays: 7, minPayout: 1000, attributionDays: 60 })
      .expect(200);
    await hook(booking('T-1', code)).expect(200);
    const w2 = await hook(booking('T-2', code)).expect(200);
    expect(w2.body.commission.rate).toBe(5);
    expect((await api('get', '/me', MARIA)).body.tier).toBe('Silver');
    const w3 = await hook(booking('T-3', code)).expect(200);
    expect(w3.body.commission.rate).toBe(7);
    expect(w3.body.commission.commission).toBe(700);
    // cancel drops tier back
    await hook(booking('T-3', code, { status: 'cancelled' })).expect(200);
    await hook(booking('T-2', code, { status: 'cancelled' })).expect(200);
    expect((await api('get', '/me', MARIA)).body.tier).toBe('Bronze');
  });

  it('enforces authorization', async () => {
    const { uid } = await onboard();
    await api('post', '/auth/session', MARIO);
    await api('get', '/me').expect(401);
    await api('get', '/me', 'Bearer garbage').expect(401);
    for (const p of ['/admin/dashboard', '/admin/analytics', '/admin/bookings', '/admin/affiliates', '/admin/commissions', '/admin/payouts', '/admin/settings', '/admin/payouts/export.csv']) {
      await api('get', p, MARIA).expect(403);
      await api('get', p).expect(401);
    }
    await api('post', `/admin/affiliates/${uid}/suspend`, MARIA).expect(403);
    await api('post', '/admin/commissions/run-approvals', MARIA).expect(403);
    await api('put', '/admin/settings', MARIA).send({}).expect(403);

    // affiliates only see their own data
    await hook(booking('S-1', code)).expect(200);
    const mario = await api('get', '/commissions', MARIO);
    expect(mario.status).toBe(403); // pending
    const uid2 = (await api('get', '/admin/affiliates?status=pending', ADMIN)).body.items[0].uid;
    await api('post', `/admin/affiliates/${uid2}/approve`, ADMIN).expect(200);
    expect((await api('get', '/commissions', MARIO)).body.items).toEqual([]);
    expect((await api('get', '/commissions', MARIA)).body.items).toHaveLength(1);
    expect((await api('get', '/analytics/overview', MARIO)).body.kpis.bookings).toBe(0);

    // body cannot set uid/role/status
    const r = await api('patch', '/me', MARIA).send({ role: 'admin', status: 'active', uid: 'x' });
    expect(r.status).toBe(400);
    const ok = await api('patch', '/me', MARIA).send({ name: 'Maria S.', phone: '0917' }).expect(200);
    expect(ok.body).toMatchObject({ role: 'affiliate', name: 'Maria S.' });

    // suspended affiliate loses access and attribution
    await api('post', `/admin/affiliates/${uid}/suspend`, ADMIN).expect(200);
    await api('get', '/dashboard', MARIA).expect(403);
    expect((await hook(booking('S-2', code))).body.source).toBe('b2c');
    expect((await api('get', `/track/validate/${code}`)).body.valid).toBe(false);
  });

  it('webhook security and validation', async () => {
    await hook(booking('W-1', undefined), 'wrong').expect(401);
    await request(t.app).post('/api/v1/webhooks/bookings').send(booking('W-1', undefined)).expect(401);
    await hook({ ref: 'x' }).expect(400);
    await hook(booking('a/b', undefined)).expect(400);
    const big = await request(t.app).post('/api/v1/webhooks/bookings').set('x-webhook-secret', SECRET).send({ ...booking('W-2', undefined), customerName: 'x'.repeat(100_000) });
    expect(big.status).toBe(413);
    const ok = await hook(booking('W-3', undefined, { source: 'b2b', channelSite: 'Acme Travel' })).expect(200);
    expect(ok.body.source).toBe('b2b');
    const list = await api('get', '/admin/bookings?source=b2b', ADMIN);
    expect(list.body.items[0]).toMatchObject({ ref: 'W-3', channelSite: 'Acme Travel', source: 'b2b' });
    const err = await api('get', '/admin/nope', ADMIN);
    expect(err.status).toBe(404);
    expect(JSON.stringify(err.body)).not.toMatch(/at .*\.ts/);
  });

  it('escapes CSV formulas', async () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('-1')).toBe(`"'-1"`);
    expect(csvCell('@cmd')).toBe(`"'@cmd"`);
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('Normal')).toBe('"Normal"');

    // end-to-end through an affiliate whose name starts with '='
    await api('post', '/auth/session', ADMIN);
    await api('post', '/auth/session', 'Bearer dev:evil@example.com:=HYPERLINK("x")');
    const uid = (await api('get', '/admin/affiliates?status=pending', ADMIN)).body.items[0].uid;
    await api('post', `/admin/affiliates/${uid}/approve`, ADMIN).expect(200);
    const evil = 'Bearer dev:evil@example.com:=HYPERLINK("x")';
    const c = (await api('get', '/me', evil)).body.code;
    await hook(booking('E-1', c, { amount: 50000 })).expect(200);
    await api('post', '/admin/commissions/run-approvals', ADMIN).expect(200);
    await api('patch', '/me', evil).send({ payout: { method: 'bank', bankName: 'BDO', accountName: '+evil', accountNumber: '123' } }).expect(200);
    await api('post', '/payouts/request', evil).send({ method: 'bank' }).expect(200);
    const csv = await api('get', '/admin/payouts/export.csv', ADMIN).expect(200);
    expect(csv.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv.text).toContain('BDO / +evil / 123');
    expect(csv.text).not.toMatch(/(^|,)"=/m);
  });

  it('rate limits click tracking per ip+code when a cache is available', async () => {
    const { uid: _u } = await onboard();
    let last = 200;
    for (let i = 0; i < 32; i++) last = (await api('post', '/track/click').send({ code })).status;
    expect(last).toBe(429);
    const noCache = setup();
    expect(noCache.cache).toBeDefined();
    const plain = createApp({ config: loadConfig({ NODE_ENV: 'test', DATA_STORE: 'memory', AUTH_MODE: 'dev' }), repo: new MemoryRepo(), cache: new NoopCache(), mailer: new RecMailer(), verifier: devVerifier() });
    for (let i = 0; i < 35; i++) await request(plain).post('/api/v1/track/click').send({ code: 'ABC' }).expect(200);
  });
});

describe('config and helpers', () => {
  it('refuses AUTH_MODE=dev in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev', DATA_STORE: 'firestore' })).toThrow(/AUTH_MODE=dev/);
    expect(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'firebase', DATA_STORE: 'firestore' })).not.toThrow();
  });

  it('maps upstream packages defensively', () => {
    expect(mapPackage({ package_id: 7, title: 'Cebu', duration: '4 days', startingPrice: '12,500', images: [{ url: 'http://i/x.jpg' }], destination: 'Cebu' })).toEqual({
      id: '7', name: 'Cebu', days: 4, price: 12500, image: 'http://i/x.jpg', destination: 'Cebu',
    });
    expect(mapPackage({ name: 'no id' })).toBeNull();
  });

  it('serves sample packages when upstream fails and nothing is cached', async () => {
    const config = loadConfig({ NODE_ENV: 'test', DATA_STORE: 'memory', AUTH_MODE: 'dev', ADMIN_EMAILS: 'boss@example.com', HOLIDAY_API_URL: 'http://upstream.invalid', HOLIDAY_API_KEY: 'k' });
    const app = createApp({
      config, repo: new MemoryRepo(), cache: new NoopCache(), mailer: new RecMailer(), verifier: devVerifier(),
      fetchImpl: (async () => {
        throw new Error('down');
      }) as unknown as typeof fetch,
    });
    await request(app).post('/api/v1/auth/session').set('Authorization', ADMIN).expect(200);
    const res = await request(app).get('/api/v1/packages').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(6);
  });
});
