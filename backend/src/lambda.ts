import serverless from 'serverless-http';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { firebaseVerifier, getDb } from './config/firebase.js';
import { createCache } from './config/valkey.js';
import { devVerifier } from './middleware/auth.js';
import { FirestoreRepo } from './repo/firestore.js';
import { MemoryRepo } from './repo/memory.js';
import { createMailer } from './services/email.js';

// AWS Lambda entrypoint (Function URL / API Gateway HTTP API, payload v2).
// Built once per cold start; same wiring as server.ts.
const config = loadConfig();
const repo = config.dataStore === 'firestore' ? new FirestoreRepo(getDb(config)) : new MemoryRepo();
const verifier = config.authMode === 'dev' ? devVerifier() : firebaseVerifier(config);
const app = createApp({ config, repo, cache: createCache(config.valkeyUrl), mailer: createMailer(config), verifier });

export const handler = serverless(app);
