const TONES: Record<string, string> = {
  active: 'green', paid: 'green', confirmed: 'green',
  pending: 'amber', requested: 'amber',
  payable: 'blue',
  suspended: 'red', rejected: 'red', cancelled: 'red', reversed: 'red',
  b2c: 'blue', b2b: 'purple', affiliate: 'teal', admin: 'gray',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? (status.length <= 3 ? status.toUpperCase() : status.charAt(0).toUpperCase() + status.slice(1));
  return <span className={`badge ${TONES[status] ?? 'gray'}`}>{text}</span>;
}
