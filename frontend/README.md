# Affiliate Platform - Frontend

Vite + React 18 + TypeScript (strict), react-router-dom v6, Firebase Auth, plain CSS.

## Quick start (demo mode, no backend, no Firebase)

```bash
npm install
npm run dev      # http://localhost:5173
```

No `.env` is needed. `VITE_USE_MOCK` defaults to `true`: all API calls are served by an in-memory store
(persisted in `localStorage`, see `src/mock/`) and sign-in is faked. On the login page use
"Continue with Google" or the "Demo as" switcher (Affiliate / Admin / Pending applicant).
Mutations really work (add packages, request payout, approve affiliates, mark paid, edit settings...).
Use "Reset data" in the demo banner to restore the seed data.

## Real mode

Copy `.env.example` to `.env`, set `VITE_USE_MOCK=false` and fill in:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Backend base URL incl. `/api/v1` |
| `VITE_B2C_URL` | B2C site used for referral links (`/?aff=CODE&pkg=ID`) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Firebase web app config |

### Firebase Google provider
1. Firebase console > Authentication > Sign-in method > enable **Google**.
2. Authentication > Settings > Authorized domains: add `localhost` and your production domain.
3. Project settings > Your apps > add a Web app and copy the config values into `.env`.
4. The backend must use the same Firebase project (firebase-admin verifies the ID token sent as `Authorization: Bearer`).

## Build

```bash
npm run build    # type-check + production build into dist/
npm run preview
```

## Deploy to Cloudflare Pages
- Build command `npm run build`, output directory `dist`, root directory `frontend`.
- Set the `VITE_*` variables (incl. `VITE_USE_MOCK=false`) in Pages > Settings > Environment variables.
- `public/_redirects` provides the SPA fallback (`/* /index.html 200`).
- DNS: add a CNAME (for example `partners.yourdomain.com`) to `<project>.pages.dev` via Pages > Custom domains.
  Add that domain to Firebase Authorized domains and to the backend CORS allow-list.
