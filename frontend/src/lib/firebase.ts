import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

/** Lazily initialised so mock mode never needs Firebase config. */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    app = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
    auth = getAuth(app);
  }
  return auth;
}

export const googleProvider = (): GoogleAuthProvider => new GoogleAuthProvider();
