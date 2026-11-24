import { getFirebaseAuth, USE_MOCK } from './firebase';
import { mockRequest } from '../mock/server';

import { ApiError } from './errors';
export { ApiError };

const BASE: string = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');

async function authHeader(): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken(); // refreshes when expired
  return { Authorization: `Bearer ${token}` };
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  if (USE_MOCK) return (await mockRequest(method, path, body)) as T;
  const headers: Record<string, string> = { ...(await authHeader()) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);

/** Fetches a file with the auth token and triggers a browser download. */
export async function download(path: string, filename: string): Promise<void> {
  let blob: Blob;
  if (USE_MOCK) {
    blob = new Blob([String(await mockRequest('GET', path))], { type: 'text/csv' });
  } else {
    const res = await fetch(BASE + path, { headers: await authHeader() });
    if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
    blob = await res.blob();
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
