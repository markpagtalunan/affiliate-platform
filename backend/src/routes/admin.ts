import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { payoutsCsv, publicCommission, publicPayout, settingsSchema, toMe } from '../services/core.js';
import type { Deps, Services } from '../services/index.js';
import { parseRange } from '../util/time.js';
import { ah } from './public.js';

const uidParam = z.string().min(1).max(128);
const optEnum = <const T extends readonly [string, ...string[]]>(v: T) => z.enum(v as unknown as [T[number], ...T[number][]]).optional();

export function adminRoutes(d: Deps, s: Services): Router {
  const r = Router();
  r.use('/admin', authenticate(d.config, d.verifier), requireAdmin);

  r.get('/admin/dashboard', ah(async (_req, res) => {
    res.json(await s.analytics.adminDashboard());
  }));

  r.get('/admin/analytics', ah(async (req, res) => {
    res.json(await s.analytics.adminAnalytics(parseRange(req.query.range)));
  }));

  r.get('/admin/bookings', ah(async (req, res) => {
    const source = optEnum(['b2c', 'b2b', 'affiliate', 'admin']).parse(req.query.source || undefined);
    const status = optEnum(['pending', 'confirmed', 'cancelled']).parse(req.query.status || undefined);
    const items = (await d.repo.listBookings({ source, status })).slice(0, 1000);
    res.json({ items });
  }));

  r.get('/admin/affiliates', ah(async (req, res) => {
    const status = optEnum(['pending', 'active', 'suspended', 'rejected']).parse(req.query.status || undefined);
    const items = (await d.repo.listAffiliates())
      .filter((a) => a.role === 'affiliate' && (!status || a.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({ ...toMe(a), createdAt: a.createdAt }));
    res.json({ items });
  }));

  r.post('/admin/affiliates/:uid/approve', ah(async (req, res) => {
    await s.core.approveAffiliate(uidParam.parse(req.params.uid));
    res.json({ ok: true });
  }));
  r.post('/admin/affiliates/:uid/reject', ah(async (req, res) => {
    await s.core.setAffiliateStatus(uidParam.parse(req.params.uid), 'rejected');
    res.json({ ok: true });
  }));
  r.post('/admin/affiliates/:uid/suspend', ah(async (req, res) => {
    await s.core.setAffiliateStatus(uidParam.parse(req.params.uid), 'suspended');
    res.json({ ok: true });
  }));

  r.get('/admin/commissions', ah(async (req, res) => {
    const status = optEnum(['pending', 'payable', 'requested', 'paid', 'reversed']).parse(req.query.status || undefined);
    res.json({ items: (await d.repo.listCommissions({ status })).map(publicCommission) });
  }));

  r.post('/admin/commissions/run-approvals', ah(async (_req, res) => {
    res.json({ moved: await s.core.runApprovals() });
  }));

  r.get('/admin/payouts/export.csv', ah(async (_req, res) => {
    const csv = payoutsCsv(await d.repo.listPayouts({}));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="payouts.csv"');
    res.send(csv);
  }));

  r.get('/admin/payouts', ah(async (req, res) => {
    const status = optEnum(['requested', 'paid', 'rejected']).parse(req.query.status || undefined);
    res.json({ items: (await d.repo.listPayouts({ status })).map(publicPayout) });
  }));

  r.post('/admin/payouts/:id/mark-paid', ah(async (req, res) => {
    await s.core.settlePayout(uidParam.parse(req.params.id), 'paid');
    res.json({ ok: true });
  }));
  r.post('/admin/payouts/:id/reject', ah(async (req, res) => {
    await s.core.settlePayout(uidParam.parse(req.params.id), 'rejected');
    res.json({ ok: true });
  }));

  r.get('/admin/settings', ah(async (_req, res) => {
    res.json(await s.core.getSettings());
  }));
  r.put('/admin/settings', ah(async (req, res) => {
    res.json(await s.core.putSettings(settingsSchema.parse(req.body ?? {})));
  }));

  return r;
}
