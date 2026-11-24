import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { firebaseVerifier, getDb } from './config/firebase.js';
import { createCache } from './config/valkey.js';
import { devVerifier } from './middleware/auth.js';
import { FirestoreRepo } from './repo/firestore.js';
import { MemoryRepo } from './repo/memory.js';
import { createMailer } from './services/email.js';

const config = loadConfig();
const repo = config.dataStore === 'firestore' ? new FirestoreRepo(getDb(config)) : new MemoryRepo();
const verifier = config.authMode === 'dev' ? devVerifier() : firebaseVerifier(config);
if (config.authMode === 'dev') console.warn('[auth] AUTH_MODE=dev: accepting dev tokens (development only)');
if (config.dataStore === 'memory') console.warn('[data] DATA_STORE=memory: data is lost on restart');
if (!config.webhookSecret) console.warn('[webhook] BOOKING_WEBHOOK_SECRET is not set: POST /webhooks/bookings will return 503');

const app = createApp({ config, repo, cache: createCache(config.valkeyUrl), mailer: createMailer(config), verifier });
const server = app.listen(config.port, () => console.log(`API listening on :${config.port}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
