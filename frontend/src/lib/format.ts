export const peso = (n: number): string => '₱' + Math.round(n).toLocaleString('en-PH');

export const fmtDate = (s?: string): string => {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const B2C_URL: string = (import.meta.env.VITE_B2C_URL || 'https://lakbayhub.example.com').replace(/\/$/, '');

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');
