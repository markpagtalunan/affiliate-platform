import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { getFirebaseAuth, googleProvider, USE_MOCK } from '../lib/firebase';
import { api } from '../lib/api';
import { errMsg } from '../lib/format';
import { getDemoRole, setDemoRole, type DemoRole } from '../mock/server';
import type { Me } from '../types';

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
}

interface AuthState {
  user: AuthUser | null;
  me: Me | null;
  loading: boolean;
  error: string | null;
  signIn: (demo?: DemoRole) => Promise<void>;
  signOut: () => Promise<void>;
  setMe: (m: Me) => void;
  refreshMe: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

async function fetchMe(): Promise<Me> {
  await api<Me>('POST', '/auth/session');
  return api<Me>('GET', '/me');
}

const toUser = (m: Me): AuthUser => ({ uid: m.uid, email: m.email, name: m.name, photoURL: m.photoURL });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (USE_MOCK) {
      if (!getDemoRole()) {
        setLoading(false);
        return;
      }
      fetchMe()
        .then((m) => {
          setMe(m);
          setUser(toUser(m));
        })
        .catch(() => setDemoRole(null))
        .finally(() => setLoading(false));
      return;
    }
    return onAuthStateChanged(getFirebaseAuth(), (fu) => {
      if (!fu) {
        setUser(null);
        setMe(null);
        setLoading(false);
        return;
      }
      setUser({ uid: fu.uid, email: fu.email ?? '', name: fu.displayName ?? '', photoURL: fu.photoURL ?? undefined });
      fetchMe()
        .then(setMe)
        .catch((e) => setError(errMsg(e)))
        .finally(() => setLoading(false));
    });
  }, []);

  const signIn = useCallback(async (demo: DemoRole = 'affiliate') => {
    setError(null);
    try {
      if (USE_MOCK) {
        setDemoRole(demo);
        const m = await fetchMe();
        setMe(m);
        setUser(toUser(m));
      } else {
        await signInWithPopup(getFirebaseAuth(), googleProvider());
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    if (USE_MOCK) setDemoRole(null);
    else await fbSignOut(getFirebaseAuth());
    setUser(null);
    setMe(null);
  }, []);

  const refreshMe = useCallback(async () => {
    setMe(await api<Me>('GET', '/me'));
  }, []);

  const value = useMemo(() => ({ user, me, loading, error, signIn, signOut, setMe, refreshMe }), [user, me, loading, error, signIn, signOut, refreshMe]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
