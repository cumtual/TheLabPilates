import { describe, it, expect } from 'vitest';
import {
  getRollingWeekRange,
  getRollingDayIndex,
  getRollingDays,
} from '../schedule-utils';

describe('schedule rolling-week helpers', () => {
  it('range starts today at 00:00 and ends on day +6 at 23:59:59', () => {
    const now = new Date(2026, 0, 15, 12, 30); // 15 Jan 2026
    const { start, end } = getRollingWeekRange(now);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(15);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);

    expect(end.getDate()).toBe(21);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('handles month/year boundaries', () => {
    const now = new Date(2025, 11, 30, 8); // 30 Dec 2025
    const { start, end } = getRollingWeekRange(now);

    expect(start.getMonth()).toBe(11);
    expect(start.getFullYear()).toBe(2025);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(5);
  });

  it('computes day indexes: today = 0, tomorrow = 1, +6 = 6', () => {
    const now = new Date(2026, 5, 10, 9); // 10 Jun 2026
    const { start } = getRollingWeekRange(now);

    const today = new Date(2026, 5, 10, 18);
    const tomorrow = new Date(2026, 5, 11, 7);
    const lastDay = new Date(2026, 5, 16, 23);

    expect(getRollingDayIndex(today, start)).toBe(0);
    expect(getRollingDayIndex(tomorrow, start)).toBe(1);
    expect(getRollingDayIndex(lastDay, start)).toBe(6);
  });

  it('builds 7 day labels starting from the given date', () => {
    const start = new Date(2026, 5, 10); // 10 Jun 2026
    const days = getRollingDays(start);

    expect(days).toHaveLength(7);
    expect(days[0].sub).toBe('10');
    expect(days[6].sub).toBe('16');
    expect(days[0].label.length).toBeGreaterThan(0);
    expect(days.every((day) => day.label === day.label.toUpperCase())).toBe(true);
  });
});
