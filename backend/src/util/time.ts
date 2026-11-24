import type { Range } from '../types.js';

export const DAY = 86_400_000;
export const iso = (ms: number): string => new Date(ms).toISOString();

/** Start (real UTC ms) of the local day containing `ms`, for a fixed local offset in minutes. */
export function startOfLocalDay(ms: number, off: number): number {
  const d = new Date(ms + off * 60_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - off * 60_000;
}

export function startOfLocalMonth(ms: number, off: number, monthDelta = 0): number {
  const d = new Date(ms + off * 60_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthDelta, 1) - off * 60_000;
}

export function startOfLocalQuarter(ms: number, off: number): number {
  const d = new Date(ms + off * 60_000);
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1) - off * 60_000;
}

export const localDateStr = (ms: number, off: number): string => new Date(ms + off * 60_000).toISOString().slice(0, 10);

export interface Bucket {
  date: string;
  start: number;
  end: number;
}

export function parseRange(v: unknown): Range {
  return v === '7d' || v === '90d' || v === '12m' ? v : '30d';
}

/** Buckets for the current period (shift=false) or the immediately preceding period of equal length (shift=true). */
export function buildBuckets(range: Range, shift: boolean, now: number, off: number): Bucket[] {
  const out: Bucket[] = [];
  if (range === '12m') {
    for (let m = 11; m >= 0; m--) {
      const mm = m + (shift ? 12 : 0);
      const start = startOfLocalMonth(now, off, -mm);
      out.push({ date: localDateStr(start, off), start, end: startOfLocalMonth(now, off, -mm + 1) });
    }
    return out;
  }
  const n = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const today = startOfLocalDay(now, off);
  for (let i = n - 1; i >= 0; i--) {
    const start = today - (i + (shift ? n : 0)) * DAY;
    out.push({ date: localDateStr(start, off), start, end: start + DAY });
  }
  return out;
}

export function bucketIndex(bs: Bucket[], ms: number): number {
  let lo = 0;
  let hi = bs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ms < bs[mid].start) hi = mid - 1;
    else if (ms >= bs[mid].end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
