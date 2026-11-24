# Affiliate Platform API

Express 4 + TypeScript (ESM) API for the affiliate portal. Auth = Firebase ID tokens (Google sign-in), data = Firestore (or in-memory for local/tests), Valkey for cache and click rate limiting, SES for email. Contract: `../API_CONTRACT.md`. Base path `/api/v1` (plus `GET /health` at the root for load balancers).

## Quick start (no cloud needed)

```bash
npm install
cp .env.example .env        # defaults: DATA_STORE=memory, AUTH_MODE=dev, MOCK_PACKAGES=true
npm run dev                 # http://localhost:8080
npm test                    # vitest + supertest, in-memory repo
npm run typecheck && npm run build && npm start
```

Dev auth (`AUTH_MODE=dev` only, refused when `NODE_ENV=production`): `Authorization: Bearer dev:<email>:<name>`. Admin = email listed in `ADMIN_EMAILS`.

```bash
curl -X POST localhost:8080/api/v1/auth/session -H "Authorization: Bearer dev:me@example.com:Me"
```

## Environment

| Var | Notes |
|---|---|
| `PORT` | default 8080 |
| `FRONTEND_ORIGIN` | CORS allow-list, comma separated. Include the B2C site origin too (it calls `POST /track/click`). |
| `ADMIN_EMAILS` | comma list; matching Google accounts get role `admin` |
| `DATA_STORE` | `firestore` (default, production) or `memory` (refused in production) |
| `AUTH_MODE` | `firebase` (default) or `dev` (refused in production) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` / `FIREBASE_SERVICE_ACCOUNT` | path to key file, or the JSON itself. Both empty = Application Default Credentials (e.g. on ECS/Cloud Run with a role) |
| `VALKEY_URL` | e.g. `redis://host:6379` (`rediss://` for TLS). Unset/down = no cache, no rate limit, never crashes |
| `AWS_REGION`, `SES_FROM` | If `SES_FROM` is empty, emails are only logged (recipient + subject) |
| `HOLIDAY_API_URL`, `HOLIDAY_API_KEY`, `MOCK_PACKAGES` | package catalog; `MOCK_PACKAGES=true` serves 6 sample packages |
| `BOOKING_WEBHOOK_SECRET` | shared secret for `POST /webhooks/bookings` (503 if unset) |
| `TRUST_PROXY` | number of proxy hops (default `1` in production, off otherwise). Behind Cloudflare + a load balancer use `2` so `req.ip` is the visitor |
| `TZ_OFFSET_MINUTES` | day/month bucketing for analytics and the "calendar quarter" tier rule. Default 480 (Philippines) |
| `IP_HASH_SALT` | salt for stored click IP hashes |

## Firebase setup

1. Create a Firebase project; enable **Authentication > Sign-in method > Google**. Add your portal domain under Authentication > Settings > Authorized domains.
2. Create a **Firestore** database (production mode, region near your users).
3. Project settings > Service accounts > generate a private key. Store it outside git; point `FIREBASE_SERVICE_ACCOUNT_PATH` at it (or paste the JSON into a secret manager and expose it as `FIREBASE_SERVICE_ACCOUNT`).
4. Deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes`.

**Firestore rules:** all access goes through this API (Admin SDK bypasses rules), so `firestore.rules` denies every client read/write. Keep it that way.

Collections: those in the contract plus `affiliate_codes/{code}` (used to reserve referral codes atomically so they are unique). Composite index: `clicks(uid, ts)` in `firestore.indexes.json`.

## Valkey

Used for: packages catalog (10 min), per-affiliate dashboard and analytics (60 s), tiers settings (5 min, invalidated on `PUT /admin/settings`), and click rate limiting (30 per minute per ip+code, HTTP 429). ElastiCache for Valkey or any Redis-compatible server works. If it is unreachable the API logs one warning and continues uncached.

## SES

Verify the sender (`SES_FROM`, identity or whole domain) in the SES console in `AWS_REGION`; while the account is in the SES sandbox, recipients must be verified too (request production access). Give the runtime IAM role `ses:SendEmail`. Credentials come from the standard AWS provider chain. Emails: application received, approved (with code), payout requested (to `ADMIN_EMAILS`), payout paid.

## Cloudflare DNS and deploy

Run the container/process anywhere with Node 22 (ECS/Fargate, App Runner, a VM with pm2, Cloud Run). `npm run build && npm start`. Terminate TLS at a load balancer or Cloudflare. In Cloudflare create `api.<domain>` (A/AAAA or CNAME to the load balancer), proxied (orange cloud), SSL mode Full (strict), and set `TRUST_PROXY` to the hop count. Set `FRONTEND_ORIGIN=https://portal.<domain>,https://www.<domain>` and the frontend `VITE_API_URL=https://api.<domain>/api/v1`. Health check path: `/health`.

## B2C site -> `POST /webhooks/bookings`

Call server-to-server whenever a booking is created or its status changes (pending / confirmed / cancelled). Send the referral code captured from `?aff=CODE` (store it in a cookie for `attributionDays`, default 60). It is idempotent per `ref`, so retries are safe. Commission is created when the booking first becomes `confirmed` (at the affiliate's current tier rate), and reversed if it is later `cancelled` while still pending/payable.

```bash
curl -X POST https://api.example.com/api/v1/webhooks/bookings \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $BOOKING_WEBHOOK_SECRET" \
  -d '{"ref":"LH-10234","packageId":"pkg_1","packageName":"Boracay Beach Escape","customerName":"Juan Dela Cruz","travelDate":"2026-12-20","amount":15900,"status":"confirmed","affiliateCode":"MARIA24","source":"b2c"}'
```

Optional fields: `channelSite` (agency/site name for B2B), `src` (`facebook|messenger|whatsapp|direct|other`, the click channel; improves the analytics "by channel" bookings split). `ref` must match `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`.

Click tracking from the B2C site: `POST /api/v1/track/click {"code":"MARIA24","packageId":"pkg_1","src":"facebook"}` (CORS must allow the B2C origin).

## Notes and decisions

- Money is whole pesos; `commission = round(amount * rate / 100)`.
- Analytics "bookings", "revenue" and conversion count `confirmed` bookings, bucketed by booking `createdAt`. Admin dashboard `bookingsThisMonth` counts non-cancelled (as in the frontend mock), revenue counts confirmed.
- Tier = highest tier whose `minBookings` <= confirmed affiliate bookings (by `createdAt`) in the current calendar quarter; recomputed after each webhook for an attributed booking (can go down on cancel).
- Commissions already `requested` or `paid` are not auto-reversed on cancel (manual clawback).
- Commission approval is a job endpoint (`POST /admin/commissions/run-approvals`); schedule it daily (EventBridge, Cloud Scheduler, cron) with an admin token, or add a small scheduled caller.
- CSV export prefixes cells starting with `= + - @` (or tab/CR) with `'`.
- Aggregations read raw documents in memory (fine for MVP volumes); move to pre-aggregated counters if clicks reach millions.
