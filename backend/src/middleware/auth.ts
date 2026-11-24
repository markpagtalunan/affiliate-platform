import { createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Config } from '../config/env.js';
import type { TokenVerifier } from '../config/firebase.js';
import { HttpError, type Repo } from '../repo/index.js';

/** Dev-only verifier: `Bearer dev:<email>:<name>`. uid derived from the email. Never constructed in production. */
export function devVerifier(): TokenVerifier {
  return {
    async verify(token) {
      const m = /^dev:([^:\s]+@[^:\s]+):(.*)$/.exec(token) ?? /^dev:([^:\s]+@[^:\s]+)$/.exec(token);
      if (!m) throw new Error('bad dev token');
      const email = m[1].toLowerCase();
      const name = (m[2] ?? '').trim() || email.split('@')[0];
      const uid = 'dev_' + createHash('sha256').update(email).digest('hex').slice(0, 20);
      return { uid, email, name, emailVerified: true };
    },
  };
}

export function authenticate(config: Config, verifier: TokenVerifier): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const h = req.header('authorization') ?? '';
      const m = /^Bearer\s+(.+)$/i.exec(h);
      if (!m) throw new HttpError(401, 'Missing bearer token');
      let v;
      try {
        v = await verifier.verify(m[1].trim());
      } catch {
        throw new HttpError(401, 'Invalid or expired token');
      }
      if (!v.email || v.emailVerified === false) throw new HttpError(401, 'A verified email is required');
      const email = v.email.toLowerCase();
      req.auth = { uid: v.uid, email, name: v.name ?? '', photoURL: v.picture, isAdmin: config.adminEmails.has(email) };
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth?.isAdmin) return next(new HttpError(403, 'Admin access required'));
  next();
};

export function requireActive(repo: Repo): RequestHandler {
  return async (req, _res, next) => {
    try {
      const a = req.auth ? await repo.getAffiliate(req.auth.uid) : null;
      if (!a || a.status !== 'active') throw new HttpError(403, 'Account not active');
      req.affiliate = a;
      next();
    } catch (e) {
      next(e);
    }
  };
}
