// Shared formatting for the creative detail panel.
import { format } from 'date-fns';

export const PLATFORM_LABEL = { google: 'Google', meta: 'Meta', tiktok: 'TikTok', pinterest: 'Pinterest', linkedin: 'LinkedIn' };

export const platformName = (platform) => PLATFORM_LABEL[platform] || platform || 'This platform';

export const COLORS = {
  line: '#2563eb', // blue-600
  baseline: '#6b7280', // gray-500
  threshold: '#d97706', // amber-600
  crossed: '#dc2626', // red-600
  projection: '#dc2626',
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const money = (v) => {
  if (!isNum(v)) return 'n/a';
  if (Math.abs(v) >= 1000) return `$${Math.round(v).toLocaleString('en-US')}`;
  return `$${v.toFixed(2)}`;
};

// How each plotted or tabulated measure prints.
export const FORMATTERS = {
  ctr: (v) => (isNum(v) ? `${(v * 100).toFixed(2)}%` : 'n/a'),
  cvr: (v) => (isNum(v) ? `${(v * 100).toFixed(2)}%` : 'n/a'),
  roas: (v) => (isNum(v) ? `${v.toFixed(2)}x` : 'n/a'),
  frequency: (v) => (isNum(v) ? v.toFixed(1) : 'n/a'),
  cpm: money,
};

// A metric day is a calendar date. "2026-11-10" parsed by Date() is UTC midnight, which
// prints as the day before in timezones west of UTC, so build local noon instead.
export const parseDay = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00)/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  }
  return new Date(value);
};

export const dayOf = (row) => parseDay(row.date ?? row.metric_date);

export const shortDate = (value) => {
  if (value === null || value === undefined) return null;
  const d = parseDay(value);
  return Number.isNaN(d.getTime()) ? null : format(d, 'MMM d');
};

// Local noon N calendar days from `now` (not N x 24h: that can repeat a date across DST).
export const daysFrom = (now, days) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12);

// Whole calendar days from `now` to `date`.
export const calendarDaysUntil = (now, date) => {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((b - a) / 864e5);
};
