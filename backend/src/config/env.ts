import { z } from 'zod';

export interface Config {
  nodeEnv: string;
  isProd: boolean;
  port: number;
  frontendOrigins: string[];
  adminEmails: Set<string>;
  dataStore: 'memory' | 'firestore';
  authMode: 'firebase' | 'dev';
  valkeyUrl?: string;
  awsRegion: string;
  sesFrom?: string;
  holidayApiUrl?: string;
  holidayApiKey?: string;
  mockPackages: boolean;
  webhookSecret?: string;
  trustProxy: boolean | number;
  tzOffsetMinutes: number;
  ipHashSalt: string;
  firebase: { serviceAccountJson?: string; serviceAccountPath?: string };
}

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_EMAILS: z.string().default(''),
  DATA_STORE: z.enum(['memory', 'firestore']).default('firestore'),
  AUTH_MODE: z.enum(['firebase', 'dev']).default('firebase'),
  VALKEY_URL: z.string().optional(),
  AWS_REGION: z.string().default('ap-southeast-1'),
  SES_FROM: z.string().optional(),
  HOLIDAY_API_URL: z.string().optional(),
  HOLIDAY_API_KEY: z.string().optional(),
  MOCK_PACKAGES: z.string().optional(),
  BOOKING_WEBHOOK_SECRET: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  TZ_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(480),
  IP_HASH_SALT: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
});

const blank = (v: string | undefined): string | undefined => (v && v.trim() ? v.trim() : undefined);

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const e = schema.parse(source);
  const isProd = e.NODE_ENV === 'production';
  if (isProd && e.AUTH_MODE === 'dev') throw new Error('AUTH_MODE=dev is not allowed when NODE_ENV=production');
  if (isProd && e.DATA_STORE === 'memory') throw new Error('DATA_STORE=memory is not allowed when NODE_ENV=production');

  let trustProxy: boolean | number = isProd ? 1 : false;
  const tp = blank(e.TRUST_PROXY);
  if (tp !== undefined) trustProxy = /^\d+$/.test(tp) ? Number(tp) : tp === 'true';

  return {
    nodeEnv: e.NODE_ENV,
    isProd,
    port: e.PORT,
    frontendOrigins: e.FRONTEND_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
    adminEmails: new Set(e.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
    dataStore: e.DATA_STORE,
    authMode: e.AUTH_MODE,
    valkeyUrl: blank(e.VALKEY_URL),
    awsRegion: e.AWS_REGION,
    sesFrom: blank(e.SES_FROM),
    holidayApiUrl: blank(e.HOLIDAY_API_URL)?.replace(/\/$/, ''),
    holidayApiKey: blank(e.HOLIDAY_API_KEY),
    mockPackages: (e.MOCK_PACKAGES ?? '').toLowerCase() === 'true',
    webhookSecret: blank(e.BOOKING_WEBHOOK_SECRET),
    trustProxy,
    tzOffsetMinutes: e.TZ_OFFSET_MINUTES,
    ipHashSalt: e.IP_HASH_SALT ?? 'affiliate-platform',
    firebase: { serviceAccountJson: blank(e.FIREBASE_SERVICE_ACCOUNT), serviceAccountPath: blank(e.FIREBASE_SERVICE_ACCOUNT_PATH) },
  };
}
