# Affiliate Platform — MVP API contract

Stack: React + Vite + TypeScript (frontend/), Node + Express + TypeScript (backend/), Firebase Auth (Google sign-in) + Firestore, Valkey (via ioredis) for cache/rate-limit, AWS SES for email, Cloudflare for DNS (docs only).
Base path: `/api/v1`. JSON. Money = whole PHP pesos (integers). Dates = ISO strings.
Auth: `Authorization: Bearer <Firebase ID token>`. Backend verifies with firebase-admin. Role `admin` if email is in env `ADMIN_EMAILS` (comma list), else `affiliate`.
Errors: `{ "error": "message" }` with proper HTTP status.

## Firestore collections
- `affiliates/{uid}`: uid, email, name, photoURL, role, status (`pending|active|suspended|rejected`), code (unique, e.g. `MARIA24`, generated on approval), tier (`Bronze|Silver|Gold|Platinum`), phone, promoChannel, payout `{method:'gcash'|'bank', gcashNumber?, bankName?, accountName?, accountNumber?}`, createdAt, approvedAt
- `affiliate_packages/{uid_packageId}`: uid, packageId, packageName, addedAt
- `clicks/{id}`: code, uid, packageId?, ts, ipHash
- `bookings/{ref}`: ref, packageId, packageName, customerName, travelDate, amount, status (`pending|confirmed|cancelled`), source (`b2c|b2b|affiliate|admin`; b2c = LakbayHub B2C website direct, b2b = B2B/agent portal, affiliate = B2C booking via referral link, admin = back-office created), channelSite? (name of the website/agency, e.g. a B2B agency name), affiliateCode?, affiliateUid?, createdAt, updatedAt
- `commissions/{ref}` (id = booking ref): ref, uid, code, packageName, amount (booking amount), rate (percent), commission, status (`pending|payable|requested|paid|reversed`), travelDate, payoutId?, createdAt, updatedAt
- `payouts/{id}`: uid, affiliateName, amount, method, details (snapshot), commissionRefs[], status (`requested|paid|rejected`), requestedAt, paidAt?
- `settings/tiers`: `{ tiers: [{name, rate, minBookings}], approvalWindowDays: 7, minPayout: 1000, attributionDays: 60 }` default Bronze 5%/0, Silver 7%/10, Gold 10%/25, Platinum 12%/50.

## Endpoints

### Public
- `GET /health`
- `POST /track/click` `{code, packageId?}` → `{ok:true}` (rate limited via Valkey; ignores unknown codes)
- `GET /track/validate/:code` → `{valid:boolean}`
- `POST /webhooks/bookings` header `x-webhook-secret` = env `BOOKING_WEBHOOK_SECRET`. Body `{ref, packageId, packageName, customerName, travelDate, amount, status:'pending'|'confirmed'|'cancelled', affiliateCode?, source?}`. Upsert booking; attribute to affiliate if code valid and active (source=`affiliate`); create commission (rate = affiliate's current tier rate) when status becomes `confirmed`; if status `cancelled` and commission exists → `reversed`. Idempotent. After confirm, recompute affiliate tier from confirmed affiliate bookings in current calendar quarter.

### Affiliate (any signed-in user)
- `POST /auth/session` → creates `affiliates/{uid}` on first call (status `pending`, role from ADMIN_EMAILS; admins get status `active`). Sends SES "application received" email on creation. Returns `Me`.
- `GET /me` → `Me` = `{uid,email,name,photoURL,role,status,code?,tier,payout?,phone?,promoChannel?}`
- `PATCH /me` `{name?,phone?,promoChannel?,payout?}` → `Me`
Everything below requires `status === 'active'` (else 403 `Account not active`).
- `GET /packages` → `{items: Package[]}`, `Package = {id,name,days,price,image?,destination?}` — catalog from the LakbayHub holiday API (env `HOLIDAY_API_URL`, `HOLIDAY_API_KEY`, cached in Valkey 10 min). If `MOCK_PACKAGES=true` or the upstream fails and no cache, serve a built-in sample list of 6 packages.
- `GET /my-packages` → `{items:[{packageId,packageName,addedAt}]}`
- `PUT /my-packages/:packageId` `{packageName}` add; `DELETE /my-packages/:packageId` remove. → `{ok:true}`
- `GET /dashboard` → `{clicks30d, bookings30d, conversionPct, earnedThisMonth, bars:[{month,value}] (last 6 months commission), funnel:{clicks,bookings}, tier:{name,rate,bookingsThisQuarter,nextTier?:{name,rate,minBookings}}, recent:Commission[]}` cached in Valkey 60s per uid.
- `GET /commissions?status=` → `{items: Commission[]}` newest first.
- `GET /payouts` → `{balance:{payable,pending,requested,paid}, items: Payout[]}`
- `POST /payouts/request` `{method}` → requires payable total >= minPayout and saved payout details; locks all `payable` commissions as `requested`; creates payout `requested`; emails admins. → `Payout`

### Admin (role admin)
- `GET /admin/dashboard` → `{bookingsThisMonth, revenueThisMonth, affiliateSharePct, activeAffiliates, pendingAffiliates, commissionLiability, pendingPayouts}`
- `GET /admin/bookings?source=&status=` → `{items: Booking[]}`
- `GET /admin/affiliates?status=` → `{items: Me[] + createdAt}`
- `POST /admin/affiliates/:uid/approve` → generates unique code, status `active`, tier `Bronze`, SES "approved" email with code. `POST /admin/affiliates/:uid/reject`, `POST /admin/affiliates/:uid/suspend` → `{ok:true}`
- `GET /admin/commissions?status=`
- `POST /admin/commissions/run-approvals` → moves `pending` commissions with travelDate + approvalWindowDays < now to `payable` → `{moved:number}`
- `GET /admin/payouts?status=` → `{items: Payout[]}`; `POST /admin/payouts/:id/mark-paid` (commissions → `paid`, SES email to affiliate); `POST /admin/payouts/:id/reject` (commissions back to `payable`)
- `GET /admin/payouts/export.csv`
- `GET /admin/settings` / `PUT /admin/settings` (the `settings/tiers` doc; invalidate cache)

`Commission` = `{ref,packageName,amount,rate,commission,status,travelDate,createdAt}`; `Payout` = `{id,uid,affiliateName,amount,method,status,requestedAt,paidAt?}`.

## Analytics (added)
`range` = `7d|30d|90d|12m` (default 30d). Every response includes `previous` KPIs for the prior period of equal length so the UI can show +/- deltas. Series bucket = day (7d/30d/90d) or month (12m).
- `GET /analytics/overview?range=` (affiliate, active) → `{range, kpis:{clicks,bookings,conversionPct,earned,avgBookingValue}, previous:{same keys}, series:[{date,clicks,bookings,earned}], funnel:{clicks,startedBooking,paid}, byPackage:[{packageId,name,clicks,bookings,conversionPct,earned}], byChannel:[{channel:'facebook'|'messenger'|'whatsapp'|'direct'|'other',clicks,bookings}], commissionByStatus:{pending,payable,requested,paid,reversed}, tier:{name,rate,bookingsThisQuarter,nextTier?}}`
- `GET /admin/analytics?range=` (admin) → `{range, kpis:{revenue,bookings,conversionPct,activeAffiliates,newAffiliates,affiliateSharePct,commissionAccrued,commissionPaid}, previous:{same keys}, series:[{date,b2c,b2b,affiliate,admin}] (revenue per source), bookingsSeries:[{date,b2c,b2b,affiliate,admin}], bySource:[{source,bookings,revenue}], topAffiliates:[{uid,name,code,tier,clicks,bookings,revenue,commission,conversionPct}], topPackages:[{packageId,name,bookings,revenue,affiliateBookings}], affiliateGrowth:[{date,total}], tierDistribution:[{tier,count}], payouts:{requestedAmount,paidAmount,liability}}`
- Click tracking gains an optional `src` (`facebook|messenger|whatsapp|direct|other`): `POST /track/click {code, packageId?, src?}`; stored on `clicks/{id}.src`. Share links built on the Links page append `&src=...`.

## Frontend routes
`/login` (Google sign-in) · `/pending` · affiliate (layout with sidebar): `/` dashboard, `/packages`, `/links`, `/sales`, `/payouts`, `/settings` · admin (`/admin/*`): `/admin` dashboard, `/admin/bookings`, `/admin/affiliates`, `/admin/payouts`, `/admin/settings`. Role/status guards: unauthenticated → /login; status pending/rejected/suspended → /pending; role admin lands on /admin.
Design: follow the approved mockup (teal #0E6B63 / dark #0B3D39 / amber #E8A33D for portal; indigo #3C4CC4 / dark #1B1F2A for admin; Inter; cards with 12px radius; status badges).
Referral link format shown in Links page: `${VITE_B2C_URL}/?aff=CODE&pkg=ID`.
