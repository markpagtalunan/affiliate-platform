import type { Config } from '../config/env.js';
import { cached, type Cache } from '../config/valkey.js';
import type { Pkg } from '../types.js';

export const SAMPLE_PACKAGES: Pkg[] = [
  { id: 'sample-boracay', name: 'Boracay Beach Escape', days: 4, price: 15900, destination: 'Boracay, Aklan' },
  { id: 'sample-palawan', name: 'El Nido and Coron Island Hopping', days: 5, price: 24500, destination: 'Palawan' },
  { id: 'sample-siargao', name: 'Siargao Surf and Chill', days: 4, price: 18900, destination: 'Siargao, Surigao del Norte' },
  { id: 'sample-bohol', name: 'Bohol and Cebu Highlights', days: 4, price: 13900, destination: 'Bohol / Cebu' },
  { id: 'sample-baguio', name: 'Baguio and Sagada Adventure', days: 3, price: 9900, destination: 'Cordillera' },
  { id: 'sample-batanes', name: 'Batanes Wonders', days: 4, price: 27500, destination: 'Batanes' },
];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function firstDefined(r: Rec, keys: string[]): unknown {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
  return undefined;
}
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return undefined;
}
function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return undefined;
}
function image(r: Rec): string | undefined {
  const v = firstDefined(r, ['image', 'imageUrl', 'image_url', 'thumbnail', 'photo', 'images']);
  if (Array.isArray(v)) {
    const f = v[0];
    return isRec(f) ? str(firstDefined(f, ['url', 'src'])) : str(f);
  }
  if (isRec(v)) return str(firstDefined(v, ['url', 'src']));
  return str(v);
}

export function mapPackage(raw: unknown): Pkg | null {
  if (!isRec(raw)) return null;
  const id = str(firstDefined(raw, ['id', 'package_id', 'packageId', '_id']));
  const name = str(firstDefined(raw, ['name', 'title', 'package_name']));
  if (!id || !name) return null;
  const pkg: Pkg = {
    id,
    name,
    days: Math.max(0, Math.round(num(firstDefined(raw, ['days', 'duration', 'no_of_days', 'numberOfDays'])) ?? 0)),
    price: Math.max(0, Math.round(num(firstDefined(raw, ['price', 'startingPrice', 'starting_price', 'cost'])) ?? 0)),
  };
  const img = image(raw);
  if (img) pkg.image = img;
  const dest = str(firstDefined(raw, ['location', 'destination']));
  if (dest) pkg.destination = dest;
  return pkg;
}

export function extractList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isRec(body)) {
    for (const k of ['data', 'items', 'packages', 'result', 'results']) {
      const v = body[k];
      if (Array.isArray(v)) return v;
      if (isRec(v)) {
        const inner = extractList(v);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

export class PackagesService {
  private lastGood: Pkg[] | null = null;
  constructor(private config: Config, private cache: Cache, private fetchImpl: typeof fetch = fetch) {}

  async list(): Promise<Pkg[]> {
    if (this.config.mockPackages || !this.config.holidayApiUrl) return SAMPLE_PACKAGES;
    try {
      return await cached(this.cache, 'packages:v1', 600, () => this.fetchUpstream());
    } catch (e) {
      console.warn('[packages] upstream failed:', (e as Error).message);
      return this.lastGood ?? SAMPLE_PACKAGES;
    }
  }

  private async fetchUpstream(): Promise<Pkg[]> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await this.fetchImpl(`${this.config.holidayApiUrl}/api/v1/holiday/get-active-packages`, {
        headers: { 'x-api-key': this.config.holidayApiKey ?? '', accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`upstream status ${res.status}`);
      const items = extractList(await res.json())
        .map(mapPackage)
        .filter((p): p is Pkg => p !== null);
      if (!items.length) throw new Error('upstream returned no usable packages');
      this.lastGood = items;
      return items;
    } finally {
      clearTimeout(timer);
    }
  }
}
