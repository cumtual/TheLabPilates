import { describe, it, expect } from 'vitest';
import {
  GRACE_PERIOD_MINUTES,
  isWithinGracePeriod,
  getMexicoCityDayBounds,
  isAttendanceWindowOpen,
} from '../date';

describe('isWithinGracePeriod', () => {
  it('uses a 10-minute grace window', () => {
    expect(GRACE_PERIOD_MINUTES).toBe(10);
  });

  it('returns true at 8 minutes after creation', () => {
    expect(
      isWithinGracePeriod(
        '2026-09-15T10:00:00-06:00',
        new Date('2026-09-15T10:08:00-06:00')
      )
    ).toBe(true);
  });

  it('returns true at exactly 10 minutes (inclusive)', () => {
    expect(
      isWithinGracePeriod(
        '2026-09-15T10:00:00-06:00',
        new Date('2026-09-15T10:10:00-06:00')
      )
    ).toBe(true);
  });

  it('returns false just after 10 minutes', () => {
    expect(
      isWithinGracePeriod(
        '2026-09-15T10:00:00-06:00',
        new Date('2026-09-15T10:10:00.001-06:00')
      )
    ).toBe(false);
  });

  it('returns false for null or invalid createdAt (fail-safe)', () => {
    expect(isWithinGracePeriod(null)).toBe(false);
    expect(isWithinGracePeriod('not-a-date')).toBe(false);
  });
});

describe('getMexicoCityDayBounds', () => {
  it('returns the CDMX calendar day boundaries as instants', () => {
    const { start, end } = getMexicoCityDayBounds('2026-09-15T20:00:00-06:00');

    expect(start.toISOString()).toBe('2026-09-15T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-16T05:59:59.999Z');
  });

  it('uses the CDMX calendar day even for late-UTC instants', () => {
    const { start } = getMexicoCityDayBounds('2026-09-16T02:00:00.000Z');

    expect(start.toISOString()).toBe('2026-09-15T06:00:00.000Z');
  });
});

describe('isAttendanceWindowOpen', () => {
  const classDate = '2026-09-15T20:00:00-06:00';

  it('is open at 23:30 CDMX on the class day', () => {
    expect(isAttendanceWindowOpen(classDate, new Date('2026-09-15T23:30:00-06:00'))).toBe(true);
  });

  it('is open before the class start time on the same day', () => {
    expect(isAttendanceWindowOpen(classDate, new Date('2026-09-15T08:00:00-06:00'))).toBe(true);
  });

  it('is closed at 00:01 CDMX of the next day', () => {
    expect(isAttendanceWindowOpen(classDate, new Date('2026-09-16T00:01:00-06:00'))).toBe(false);
  });

  it('is closed on the previous calendar day', () => {
    expect(isAttendanceWindowOpen(classDate, new Date('2026-09-14T23:00:00-06:00'))).toBe(false);
  });

  it('returns false for null or invalid class date', () => {
    expect(isAttendanceWindowOpen(null)).toBe(false);
    expect(isAttendanceWindowOpen('not-a-date')).toBe(false);
  });
});
