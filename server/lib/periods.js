import { todayBogota } from './dates.js';

const DAY_MS = 86_400_000;

function asUtcDate(value) {
  return new Date(`${value}T12:00:00Z`);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function spanishMonthDay(value) {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(asUtcDate(value)).replace('.', '');
}

export function isValidYear(value) {
  return /^\d{4}$/.test(String(value || ''));
}

export function isValidWeekKey(value) {
  if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(String(value || ''))) return false;
  const info = isoWeekInfo(isoWeekBounds(value).start);
  return info.key === value;
}

export function yearBounds(year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return {
    start,
    end,
    days: daysBetweenInclusive(start, end),
    year: Number(year)
  };
}

export function isoWeekInfo(dateValue) {
  const date = asUtcDate(dateValue);
  const day = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() - day + 3);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return {
    year: isoYear,
    week,
    key: `${isoYear}-W${pad2(week)}`,
    start: addDaysToDate(dateValue, -day)
  };
}

export function isoWeekBounds(key) {
  const [yearText, weekText] = String(key).split('-W');
  const year = Number(yearText);
  const week = Number(weekText);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    throw new Error('Semana inválida');
  }
  const jan4 = new Date(Date.UTC(year, 0, 4, 12));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const start = new Date(firstMonday);
  start.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: toIsoDate(start), end: toIsoDate(end), days: 7, year, week };
}

export function addDaysToDate(dateValue, days) {
  const date = asUtcDate(dateValue);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return toIsoDate(date);
}

export function daysBetweenInclusive(start, end) {
  return Math.max(1, Math.round((asUtcDate(end) - asUtcDate(start)) / DAY_MS) + 1);
}

export function monthDays(month) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

export function monthsInRange(start, end) {
  const first = start.slice(0, 7);
  const last = end.slice(0, 7);
  const [year, mon] = first.split('-').map(Number);
  const [endYear, endMon] = last.split('-').map(Number);
  const months = [];
  let current = new Date(Date.UTC(year, mon - 1, 1));
  const lastDate = new Date(Date.UTC(endYear, endMon - 1, 1));
  while (current <= lastDate) {
    months.push(current.toISOString().slice(0, 7));
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
  }
  return months;
}

export function overlapDays(start, end, rangeStart, rangeEnd) {
  const from = start > rangeStart ? start : rangeStart;
  const to = end < rangeEnd ? end : rangeEnd;
  if (from > to) return 0;
  return daysBetweenInclusive(from, to);
}

export function shiftDateByMonthsPreserveDay(dateValue, months) {
  const [year, mon, day] = dateValue.split('-').map(Number);
  const targetMonthIndex = mon - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${pad2(normalizedMonth + 1)}-${pad2(Math.min(day, lastDay))}`;
}

export function periodFromDate(dateValue) {
  return resolvePeriod('week', isoWeekInfo(dateValue).key);
}

export function resolvePeriod(type = 'month', value) {
  const normalizedType = ['month', 'week', 'year'].includes(type) ? type : 'month';
  if (normalizedType === 'year') {
    const year = isValidYear(value) ? String(value) : todayBogota().slice(0, 4);
    const bounds = yearBounds(year);
    return {
      type: 'year',
      value: year,
      key: year,
      start: bounds.start,
      end: bounds.end,
      days: bounds.days,
      label: `Año ${year}`,
      shortLabel: year,
      year: Number(year)
    };
  }
  if (normalizedType === 'week') {
    const key = isValidWeekKey(value) ? value : isoWeekInfo(todayBogota()).key;
    const bounds = isoWeekBounds(key);
    const label = `Semana ${bounds.week} · ${spanishMonthDay(bounds.start)} – ${spanishMonthDay(bounds.end)} ${bounds.year}`;
    return {
      type: 'week',
      value: key,
      key,
      start: bounds.start,
      end: bounds.end,
      days: bounds.days,
      label,
      shortLabel: `Sem ${bounds.week}`,
      year: bounds.year,
      week: bounds.week
    };
  }
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''))
    ? String(value)
    : todayBogota().slice(0, 7);
  const [year, mon] = month.split('-').map(Number);
  const endDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, mon - 1, 1)));
  return {
    type: 'month',
    value: month,
    key: month,
    start: `${month}-01`,
    end: `${month}-${pad2(endDay)}`,
    days: endDay,
    label: label.charAt(0).toUpperCase() + label.slice(1),
    shortLabel: new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, mon - 1, 1))).replace('.', ''),
    year,
    month: mon
  };
}

export function previousPeriodDescriptor(period) {
  if (period.type === 'year') return resolvePeriod('year', String(Number(period.value) - 1));
  if (period.type === 'week') {
    const previousStart = addDaysToDate(period.start, -7);
    return resolvePeriod('week', isoWeekInfo(previousStart).key);
  }
  const [year, mon] = period.value.split('-').map(Number);
  const previous = new Date(Date.UTC(year, mon - 2, 1));
  return resolvePeriod('month', previous.toISOString().slice(0, 7));
}

export function resolvePeriodFromQuery(query = {}, fallbackDate = todayBogota()) {
  if (query.periodType) {
    return resolvePeriod(query.periodType, query.value || query.periodValue || query.period);
  }
  if (query.period && /^\d{4}-W\d{2}$/.test(String(query.period))) {
    return resolvePeriod('week', query.period);
  }
  if (query.period && /^\d{4}$/.test(String(query.period))) {
    return resolvePeriod('year', query.period);
  }
  if (query.month) return resolvePeriod('month', query.month);
  return resolvePeriod('month', fallbackDate.slice(0, 7));
}

export function periodOptions(currentPeriod, { minYear } = {}) {
  const today = todayBogota();
  const currentMonth = today.slice(0, 7);
  const currentYear = Number(today.slice(0, 4));
  const anchorMonth = currentPeriod.type === 'month' ? currentPeriod.value : currentMonth;
  const [anchorYear, anchorMon] = anchorMonth.split('-').map(Number);
  const months = [];
  const weeks = [];
  for (let index = 0; index < 18; index += 1) {
    const date = new Date(Date.UTC(anchorYear, anchorMon - 1 - index, 1));
    const period = resolvePeriod('month', date.toISOString().slice(0, 7));
    months.push({ value: period.value, label: period.label, current: period.value === currentMonth });
  }
  const weekAnchor = currentPeriod.type === 'week' ? currentPeriod.start : isoWeekInfo(today).start;
  for (let index = 0; index < 52; index += 1) {
    const start = addDaysToDate(weekAnchor, -index * 7);
    const key = isoWeekInfo(start).key;
    const period = resolvePeriod('week', key);
    weeks.push({ value: key, label: period.label, current: key === isoWeekInfo(today).key });
  }
  const earliest = Number(minYear) || currentYear - 5;
  const selectedYear = currentPeriod.type === 'year' ? Number(currentPeriod.value) : null;
  const firstYear = Math.min(earliest, selectedYear || earliest, currentYear);
  const years = [];
  for (let year = currentYear; year >= firstYear; year -= 1) {
    years.push({
      value: String(year),
      label: year === currentYear ? `Año ${year} (completo)` : `Año ${year}`,
      current: year === currentYear
    });
  }
  return { months, weeks, years };
}

function fallbackToday() {
  return todayBogota();
}

export function describePeriod(period) {
  return {
    type: period.type,
    value: period.value,
    key: period.key,
    start: period.start,
    end: period.end,
    days: period.days,
    label: period.label,
    shortLabel: period.shortLabel,
    year: period.year,
    week: period.week,
    month: period.month || null
  };
}
