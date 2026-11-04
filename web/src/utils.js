const BOGOTA = 'America/Bogota';

export const CURRENCY = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

export const NUMBER = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0
});

export const NUMBER_DECIMALS = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 2
});

export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return CURRENCY.format(Number(value));
}

export function formatCurrencyCompact(value) {
  const number = Number(value) || 0;
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000_000) return `$${(number / 1_000_000_000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} mil M`;
  if (absolute >= 1_000_000) return `$${(number / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (absolute >= 1_000) return `$${(number / 1_000).toLocaleString('es-CO', { maximumFractionDigits: 0 })} mil`;
  return formatCurrency(number);
}

export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return (decimals ? NUMBER_DECIMALS : NUMBER).format(Number(value));
}

export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}%`;
}

export function formatDate(value, { short = false, long = false } = {}) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  if (long) {
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  }
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: short ? '2-digit' : 'short',
    year: short ? '2-digit' : 'numeric',
    timeZone: 'UTC'
  }).format(date).replace('.', '');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BOGOTA,
    hour12: false
  }).format(date);
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function currentMonth() {
  return todayISO().slice(0, 7);
}

export function monthOf(value) {
  return value ? String(value).slice(0, 7) : currentMonth();
}

export function monthBounds(month) {
  const [year, mon] = String(month).split('-').map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

export function monthLabel(month, { short = false } = {}) {
  if (!month) return '—';
  const [year, mon] = String(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1, 1));
  const value = new Intl.DateTimeFormat('es-CO', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric',
    timeZone: 'UTC'
  }).format(date).replace('.', '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function monthOptions(count = 18, endMonth = currentMonth()) {
  const [year, mon] = endMonth.split('-').map(Number);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(year, mon - 1 - i, 1));
    const key = date.toISOString().slice(0, 7);
    entries.push({ value: key, label: monthLabel(key) });
  }
  return entries;
}

export function addDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

export function addMonths(value, count) {
  const [year, mon] = String(value).slice(0, 7).split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

export function initials(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function roleLabel(role) {
  return { administrador: 'Administrador', vendedor: 'Vendedor', contador: 'Contador' }[role] || role;
}

export function conceptLabel(concept) {
  return {
    producto: 'Producto',
    flete: 'Flete',
    descargue: 'Descargue',
    cargue: 'Cargue',
    servicio: 'Servicio'
  }[concept] || concept;
}

export function categoryLabel(category) {
  const value = String(category || 'otro');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function methodLabel(method) {
  return method === 'bancos' ? 'Bancos' : 'Efectivo';
}

export function statusTone(status) {
  const key = String(status || '').toLowerCase();
  if (['pagada', 'green', 'saludable', 'activo', 'activa'].includes(key)) return 'green';
  if (['vencida', 'red', 'crítico', 'inactivo'].includes(key)) return 'red';
  if (['por vencer', 'próxima', 'proxima', 'yellow', 'atención', 'credito', 'crédito'].includes(key)) return 'yellow';
  if (['pendiente', 'neutral', 'sin datos'].includes(key)) return 'neutral';
  return 'blue';
}

export function fileNameDate() {
  return todayISO();
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`;
}

export function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: BOGOTA,
    hour: 'numeric',
    hour12: false
  }).format(new Date()));
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function percentOf(part, total) {
  if (!Number(total)) return 0;
  return (Number(part) / Number(total)) * 100;
}

export function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function sanitizeFilename(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-');
}

export function statusLabelFromKey(key) {
  return {
    pagada: 'Pagada',
    pendiente: 'Pendiente',
    vencida: 'Vencida',
    por_vencer: 'Por vencer',
    proxima: 'Próxima',
    credito: 'Crédito'
  }[key] || key;
}
