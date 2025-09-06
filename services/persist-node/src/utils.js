export function slugify(input) {
  if (!input) return null;
  // Lowercase, remove non-word (keep spaces and dashes), collapse spaces to dash
  const s = String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || null;
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

export function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
