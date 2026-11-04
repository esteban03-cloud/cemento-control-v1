const BOGOTA_ZONE = 'America/Bogota';
const DAY_MS = 86_400_000;

export function todayBogota() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function nowBogotaParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function todayOr(value) {
  return isValidDate(value) ? value : todayBogota();
}

export function monthOf(value = todayBogota()) {
  return String(value).slice(0, 7);
}

export function isValidMonth(month) {
  return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export function monthBounds(month) {
  if (!isValidMonth(month)) throw new Error('Período inválido');
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
    year,
    month: mon,
    lastDay
  };
}

export function addDays(date, days) {
  const [y, m, d] = String(date).split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d) + Number(days) * DAY_MS);
  return value.toISOString().slice(0, 10);
}

export function addMonths(month, count) {
  const [year, mon] = month.split('-').map(Number);
  const value = new Date(Date.UTC(year, mon - 1 + count, 1));
  return value.toISOString().slice(0, 7);
}

export function prevMonth(month) {
  return addMonths(month, -1);
}

export function monthRange(month, count) {
  const entries = [];
  for (let i = count - 1; i >= 0; i -= 1) entries.push(addMonths(month, -i));
  return entries;
}

export function diffDays(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

export function asOfToday() {
  return todayBogota();
}

export function monthLabel(month) {
  if (!isValidMonth(month)) return month;
  const [year, mon] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, mon - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortMonthLabel(month) {
  const [year, mon] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, mon - 1, 1)))
    .replace('.', '');
}

export function dateLabel(value) {
  if (!isValidDate(value)) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T12:00:00Z`));
}

export function stamp() {
  const parts = nowBogotaParts();
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}
