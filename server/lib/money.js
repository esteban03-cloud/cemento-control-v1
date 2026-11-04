export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function money(value) {
  return round2(Number(value) || 0);
}

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function pct(part, total, decimals = 1) {
  if (!Number(total)) return 0;
  return round2((Number(part) / Number(total)) * 100 * 10 ** decimals) / 10 ** decimals;
}

export function cop(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

export function unit(value, decimals = 0) {
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0
  }).format(Number(value) || 0);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function roundStock(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}
