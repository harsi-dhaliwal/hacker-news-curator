// Deterministic color selection from a small safe Tailwind palette
const PALETTE = [
  { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200' },
  { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-200' },
  { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200' },
];

export function colorForKey(key?: string | null) {
  if (!key) return PALETTE[0];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

