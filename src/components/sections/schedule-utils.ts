const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleDay {
  /** Short weekday label, e.g. "SÁB". */
  label: string;
  /** Day of month, e.g. "12". */
  sub: string;
}

/**
 * Rolling 7-day window starting today at 00:00:00 and ending on day +6 at 23:59:59.999.
 */
export function getRollingWeekRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * 0-based index of `classDate` within the rolling window (today = 0 ... +6 = 6).
 * Uses local midnights so DST/time-of-day never shift the index.
 */
export function getRollingDayIndex(classDate: Date, start: Date): number {
  const classDay = new Date(classDate);
  classDay.setHours(0, 0, 0, 0);

  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);

  return Math.round((classDay.getTime() - startDay.getTime()) / DAY_MS);
}

/**
 * Builds the 7 day tabs (label + day number) starting from `start`.
 */
export function getRollingDays(start: Date): ScheduleDay[] {
  const formatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short' });

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      label: formatter.format(date).replace('.', '').toUpperCase(),
      sub: date.getDate().toString(),
    };
  });
}
