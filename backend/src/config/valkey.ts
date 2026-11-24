import { Redis } from 'ioredis';

/** Cache abstraction. Every method degrades silently (cache miss / no limit) if Valkey is unset or down. */
export interface Cache {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Increment a counter with TTL; returns the new count or null if unavailable. */
  incr(key: string, ttlSeconds: number): Promise<number | null>;
}

export class NoopCache implements Cache {
  async getJson<T>(): Promise<T | null> {
    return null;
  }
  async setJson(): Promise<void> {}
  async del(): Promise<void> {}
  async incr(): Promise<number | null> {
    return null;
  }
}

/** In-process cache (tests). */
export class MemoryCache implements Cache {
  private m = new Map<string, { v: string; exp: number }>();
  async getJson<T>(key: string): Promise<T | null> {
    const e = this.m.get(key);
    if (!e || e.exp < Date.now()) return null;
    return JSON.parse(e.v) as T;
  }
  async setJson(key: string, value: unknown, ttl: number): Promise<void> {
    this.m.set(key, { v: JSON.stringify(value), exp: Date.now() + ttl * 1000 });
  }
  async del(...keys: string[]): Promise<void> {
    keys.forEach((k) => this.m.delete(k));
  }
  async incr(key: string, ttl: number): Promise<number | null> {
    const e = this.m.get(key);
    const n = e && e.exp >= Date.now() ? Number(e.v) + 1 : 1;
    this.m.set(key, { v: String(n), exp: e && e.exp >= Date.now() ? e.exp : Date.now() + ttl * 1000 });
    return n;
  }
}

export class ValkeyCache implements Cache {
  constructor(private r: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const v = await this.r.get(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  }
  async setJson(key: string, value: unknown, ttl: number): Promise<void> {
    try {
      await this.r.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      /* degrade */
    }
  }
  async del(...keys: string[]): Promise<void> {
    try {
      if (keys.length) await this.r.del(...keys);
    } catch {
      /* degrade */
    }
  }
  async incr(key: string, ttl: number): Promise<number | null> {
    try {
      const n = await this.r.incr(key);
      if (n === 1) await this.r.expire(key, ttl);
      return n;
    } catch {
      return null;
    }
  }
}

export function createCache(url?: string): Cache {
  if (!url) return new NoopCache();
  try {
    let warned = false;
    const r = new Redis(url, {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 500,
      retryStrategy: (n) => Math.min(n * 500, 10_000),
    });
    r.on('error', () => {
      if (!warned) {
        warned = true;
        console.warn('[valkey] unavailable, running without cache/rate limiting');
      }
    });
    r.on('ready', () => {
      warned = false;
    });
    return new ValkeyCache(r);
  } catch {
    return new NoopCache();
  }
}

export async function cached<T>(cache: Cache, key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = await cache.getJson<T>(key);
  if (hit !== null) return hit;
  const v = await fn();
  await cache.setJson(key, v, ttl);
  return v;
}
