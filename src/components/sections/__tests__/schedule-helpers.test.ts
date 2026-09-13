import { describe, it, expect } from 'vitest';
import {
  getRollingWeekRange,
  getRollingDayIndex,
  getRollingDays,
  getMexicoCityDateString,
} from '../schedule-utils';

describe('schedule rolling-week helpers', () => {
  it('range starts today at 00:00 CDMX and ends on day +6 at 23:59:59.999 CDMX', () => {
    const now = new Date('2026-01-15T12:30:00-06:00'); // 15 Jan 2026
    const { start, end } = getRollingWeekRange(now);

    expect(getMexicoCityDateString(start)).toBe('2026-01-15');
    expect(getMexicoCityDateString(end)).toBe('2026-01-21');
    expect(start.toISOString()).toBe('2026-01-15T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-22T05:59:59.999Z');
  });

  it('handles month/year boundaries', () => {
    const now = new Date('2025-12-30T08:00:00-06:00'); // 30 Dec 2025
    const { start, end } = getRollingWeekRange(now);

    expect(getMexicoCityDateString(start)).toBe('2025-12-30');
    expect(getMexicoCityDateString(end)).toBe('2026-01-05');
  });

  it('computes day indexes: today = 0, tomorrow = 1, +6 = 6', () => {
    const now = new Date('2026-06-10T09:00:00-06:00'); // 10 Jun 2026 CDMX
    const { start } = getRollingWeekRange(now);

    const today = new Date('2026-06-10T18:00:00-06:00');
    const tomorrow = new Date('2026-06-11T07:00:00-06:00');
    const lastDay = new Date('2026-06-16T23:00:00-06:00');

    expect(getRollingDayIndex(today, start)).toBe(0);
    expect(getRollingDayIndex(tomorrow, start)).toBe(1);
    expect(getRollingDayIndex(lastDay, start)).toBe(6);
  });

  it('maps a late-night CDMX class to its local day, not the next UTC day', () => {
    const now = new Date('2026-06-10T09:00:00-06:00'); // Wed 10 Jun CDMX
    const { start } = getRollingWeekRange(now);

    // Saturday 23:30 CDMX === Sunday 05:30 UTC — must stay on day index 3.
    const saturdayNight = new Date('2026-06-13T23:30:00-06:00');
    expect(saturdayNight.toISOString()).toBe('2026-06-14T05:30:00.000Z');
    expect(getRollingDayIndex(saturdayNight, start)).toBe(3);
  });

  it('builds 7 day labels starting from the given date in CDMX', () => {
    const start = new Date('2026-06-10T00:00:00-06:00'); // 10 Jun 2026
    const days = getRollingDays(start);

    expect(days).toHaveLength(7);
    expect(days[0].sub).toBe('10');
    expect(days[6].sub).toBe('16');
    expect(days[0].label.length).toBeGreaterThan(0);
    expect(days.every((day) => day.label === day.label.toUpperCase())).toBe(true);
  });
});
