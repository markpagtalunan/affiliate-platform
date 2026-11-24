import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../repo/index.js';
import type { Deps, Services } from '../services/index.js';
import { normalizeChannel } from '../services/core.js';

export const ah = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const idStr = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'invalid id');
const codeStr = z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, 'invalid code');

const clickSchema = z.object({ code: codeStr, packageId: z.union([z.string(), z.number()]).transform(String).pipe(idStr).optional(), src: z.string().max(20).optional() });

const bookingSchema = z.object({
  ref: idStr,
  packageId: z.union([z.string().min(1).max(100), z.number()]).transform(String),
  packageName: z.string().min(1).max(200),
  customerName: z.string().max(200).default(''),
  travelDate: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date'),
  amount: z.number().finite().min(0).max(100_000_000).transform((n) => Math.round(n)),
  status: z.enum(['pending', 'confirmed', 'cancelled']),
  affiliateCode: z.string().max(32).nullish(),
  source: z.enum(['b2c', 'b2b', 'affiliate', 'admin']).optional(),
  channelSite: z.string().max(200).optional(),
  src: z.string().max(20).optional(),
});

function secretMatches(provided: string | undefined, expected: string): boolean {
  const a = createHash('sha256').update(provided ?? '').digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function publicRoutes(d: Deps, s: Services): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  r.post(
    '/track/click',
    ah(async (req, res) => {
      const body = clickSchema.parse(req.body ?? {});
      const code = body.code.toUpperCase();
      const ipHash = createHash('sha256').update(`${d.config.ipHashSalt}|${req.ip ?? ''}`).digest('hex').slice(0, 32);
      const n = await d.cache.incr(`rl:click:${ipHash}:${code}`, 60);
      if (n !== null && n > 30) throw new HttpError(429, 'Too many requests');
      const aff = await d.repo.getAffiliateByCode(code);
      if (aff && aff.status === 'active') {
        await d.repo.addClick({
          id: randomUUID(), code, uid: aff.uid, packageId: body.packageId, src: normalizeChannel(body.src), ts: new Date().toISOString(), ipHash,
        });
      }
      res.json({ ok: true });
    }),
  );

  r.get(
    '/track/validate/:code',
    ah(async (req, res) => {
      const parsed = codeStr.safeParse(req.params.code);
      if (!parsed.success) return void res.json({ valid: false });
      const aff = await d.repo.getAffiliateByCode(parsed.data.toUpperCase());
      res.json({ valid: !!aff && aff.status === 'active' });
    }),
  );

  r.post(
    '/webhooks/bookings',
    ah(async (req, res) => {
      if (!d.config.webhookSecret) throw new HttpError(503, 'Webhook not configured');
      if (!secretMatches(req.header('x-webhook-secret'), d.config.webhookSecret)) throw new HttpError(401, 'Invalid webhook secret');
      const input = bookingSchema.parse(req.body ?? {});
      const { booking, commission } = await s.core.handleBooking(input);
      res.json({ ok: true, ref: booking.ref, status: booking.status, source: booking.source, commission: commission ? { status: commission.status, commission: commission.commission, rate: commission.rate } : null });
    }),
  );

  return r;
}
