import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireActive } from '../middleware/auth.js';
import { HttpError } from '../repo/index.js';
import { parseRange } from '../util/time.js';
import { publicCommission, publicPayout, sum, toMe } from '../services/core.js';
import type { Deps, Services } from '../services/index.js';
import { ah } from './public.js';
import type { Affiliate } from '../types.js';

const payoutSchema = z
  .object({
    method: z.enum(['gcash', 'bank']),
    gcashNumber: z.string().trim().max(40).optional(),
    bankName: z.string().trim().max(100).optional(),
    accountName: z.string().trim().max(100).optional(),
    accountNumber: z.string().trim().max(60).optional(),
  })
  .strict();

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().max(40).optional(),
    promoChannel: z.string().trim().max(200).optional(),
    payout: payoutSchema.optional(),
  })
  .strict();

const pkgId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'invalid package id');

export function affiliateRoutes(d: Deps, s: Services): Router {
  const r = Router();
  const auth = authenticate(d.config, d.verifier);
  const active = requireActive(d.repo);

  r.post('/auth/session', auth, ah(async (req, res) => {
    res.json(await s.core.createSession(req.auth!));
  }));

  r.get('/me', auth, ah(async (req, res) => {
    const a = await d.repo.getAffiliate(req.auth!.uid);
    if (!a) throw new HttpError(404, 'Profile not found. Call POST /auth/session first.');
    res.json(toMe(a, req.auth!.isAdmin));
  }));

  r.patch('/me', auth, ah(async (req, res) => {
    const b = patchSchema.parse(req.body ?? {});
    const patch: Partial<Affiliate> = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.phone !== undefined) patch.phone = b.phone;
    if (b.promoChannel !== undefined) patch.promoChannel = b.promoChannel;
    if (b.payout !== undefined) patch.payout = b.payout;
    const a = await d.repo.updateAffiliate(req.auth!.uid, patch);
    if (!a) throw new HttpError(404, 'Profile not found. Call POST /auth/session first.');
    res.json(toMe(a, req.auth!.isAdmin));
  }));

  // ---- active affiliates only ----
  r.get('/packages', auth, active, ah(async (_req, res) => {
    res.json({ items: await s.packages.list() });
  }));

  r.get('/my-packages', auth, active, ah(async (req, res) => {
    res.json({ items: await d.repo.listMyPackages(req.affiliate!.uid) });
  }));

  r.put('/my-packages/:packageId', auth, active, ah(async (req, res) => {
    const id = pkgId.parse(req.params.packageId);
    const body = z.object({ packageName: z.string().trim().min(1).max(200).optional() }).parse(req.body ?? {});
    const name = body.packageName ?? (await s.packages.list()).find((p) => p.id === id)?.name ?? id;
    await d.repo.addMyPackage(req.affiliate!.uid, id, name);
    res.json({ ok: true });
  }));

  r.delete('/my-packages/:packageId', auth, active, ah(async (req, res) => {
    await d.repo.removeMyPackage(req.affiliate!.uid, pkgId.parse(req.params.packageId));
    res.json({ ok: true });
  }));

  r.get('/dashboard', auth, active, ah(async (req, res) => {
    res.json(await s.analytics.dashboard(req.affiliate!));
  }));

  r.get('/analytics/overview', auth, active, ah(async (req, res) => {
    res.json(await s.analytics.affiliateOverview(req.affiliate!, parseRange(req.query.range)));
  }));

  r.get('/commissions', auth, active, ah(async (req, res) => {
    const status = z.enum(['pending', 'payable', 'requested', 'paid', 'reversed']).optional().parse(req.query.status || undefined);
    res.json({ items: (await d.repo.listCommissions({ uid: req.affiliate!.uid, status })).map(publicCommission) });
  }));

  r.get('/payouts', auth, active, ah(async (req, res) => {
    const uid = req.affiliate!.uid;
    const [mine, items] = await Promise.all([d.repo.listCommissions({ uid }), d.repo.listPayouts({ uid })]);
    const by = (st: string) => sum(mine.filter((c) => c.status === st).map((c) => c.commission));
    res.json({ balance: { payable: by('payable'), pending: by('pending'), requested: by('requested'), paid: by('paid') }, items: items.map(publicPayout) });
  }));

  r.post('/payouts/request', auth, active, ah(async (req, res) => {
    const { method } = z.object({ method: z.enum(['gcash', 'bank']) }).parse(req.body ?? {});
    const payout = await s.core.requestPayout(req.affiliate!, method);
    res.json(publicPayout(payout));
  }));

  return r;
}
