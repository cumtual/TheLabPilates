import { TIMEZONE } from '@/lib/utils/date';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleDay {
  /** Short weekday label, e.g. "SÁB". */
  label: string;
  /** Day of month, e.g. "12". */
  sub: string;
}

/**
 * Calendar date (YYYY-MM-DD) in America/Mexico_City for a given instant.
 * Uses en-CA because it renders in ISO-like YYYY-MM-DD order.
 */
export function getMexicoCityDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Rolling 7-day window starting today at 00:00:00 and ending on day +6 at 23:59:59.999,
 * evaluated against the America/Mexico_City calendar (not the server's local timezone).
 *
 * Mexico City is UTC-6 year-round (no DST since Oct 2022), so a fixed -06:00 offset is safe.
 */
export function getRollingWeekRange(now: Date = new Date()): { start: Date; end: Date } {
  const startStr = getMexicoCityDateString(now);
  const startMs = Date.parse(`${startStr}T00:00:00-06:00`);

  return {
    start: new Date(startMs),
    end: new Date(startMs + 7 * DAY_MS - 1),
  };
}

/**
 * 0-based index of `classDate` within the rolling window (today = 0 ... +6 = 6).
 * Compares calendar days in America/Mexico_City, so a late-night class that crosses
 * midnight UTC still maps to the correct local day.
 */
export function getRollingDayIndex(classDate: Date, start: Date): number {
  const toCalendarMidnightUtc = (date: Date) =>
    Date.parse(`${getMexicoCityDateString(date)}T00:00:00Z`);

  return Math.round(
    (toCalendarMidnightUtc(classDate) - toCalendarMidnightUtc(start)) / DAY_MS
  );
}

/**
 * Builds the 7 day tabs (label + day number) starting from `start`.
 * Weekday labels and day numbers are rendered in America/Mexico_City.
 */
export function getRollingDays(start: Date): ScheduleDay[] {
  const weekdayFormatter = new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    timeZone: TIMEZONE,
  });

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);

    return {
      label: weekdayFormatter.format(date).replace('.', '').toUpperCase(),
      sub: getMexicoCityDateString(date).slice(8, 10).replace(/^0/, ''),
    };
  });
}
