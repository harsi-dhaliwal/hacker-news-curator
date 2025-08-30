function parseArrayParam(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function clamp(n, min, max) {
  const num = Number.isFinite(n) ? n : parseFloat(n);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

module.exports = { parseArrayParam, clamp };

