import { readFileSync } from 'node:fs';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Config } from './env.js';

let app: App | undefined;

export function getFirebaseApp(config: Config): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) return (app = existing);
  const { serviceAccountJson, serviceAccountPath } = config.firebase;
  let credential;
  if (serviceAccountJson) credential = cert(JSON.parse(serviceAccountJson));
  else if (serviceAccountPath) credential = cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8')));
  else credential = applicationDefault();
  app = initializeApp({ credential });
  return app;
}

export function getDb(config: Config): Firestore {
  const dbId = config.firebase.databaseId;
  const db = dbId ? getFirestore(getFirebaseApp(config), dbId) : getFirestore(getFirebaseApp(config));
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* settings already applied */
  }
  return db;
}

export interface VerifiedToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export function firebaseVerifier(config: Config): TokenVerifier {
  const auth = getAuth(getFirebaseApp(config));
  return {
    async verify(token) {
      const d = await auth.verifyIdToken(token);
      return { uid: d.uid, email: d.email, name: d.name as string | undefined, picture: d.picture, emailVerified: d.email_verified };
    },
  };
}
