// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import {
  getMexicoCityYmd,
  getMexicoCityYearMonth,
  getMexicoCityEndOfMonth,
  getMexicoCityRangeForDays,
  isValidYmd,
} from '@/lib/utils/date';

/** Helpers CDMX de la cafetería (SPEC-CAFETERIA §4.2, §4.6, TASK-CF-DOM-02). */

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe('getMexicoCityYearMonth', () => {
  it('31/oct 23:59 CDMX sigue en octubre; 1/nov 00:00 CDMX es noviembre', () => {
    expect(getMexicoCityYearMonth(new Date('2026-11-01T05:59:59.999Z'))).toBe('2026-10');
    expect(getMexicoCityYearMonth(new Date('2026-11-01T06:00:00.000Z'))).toBe('2026-11');
  });

  it('no depende de process.env.TZ', () => {
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
      process.env.TZ = tz;
      expect(getMexicoCityYearMonth(new Date('2026-11-01T05:59:59.999Z'))).toBe('2026-10');
    }
  });
});

describe('getMexicoCityYmd', () => {
  it('usa el calendario CDMX', () => {
    expect(getMexicoCityYmd(new Date('2026-10-16T05:59:59.999Z'))).toBe('2026-10-15');
    expect(getMexicoCityYmd(new Date('2026-10-16T06:00:00.000Z'))).toBe('2026-10-16');
  });
});

describe('getMexicoCityEndOfMonth', () => {
  it('último milisegundo del mes CDMX', () => {
    expect(getMexicoCityEndOfMonth(new Date('2026-10-15T16:00:00Z')).toISOString()).toBe('2026-11-01T05:59:59.999Z');
    expect(getMexicoCityEndOfMonth(new Date('2026-12-31T20:00:00Z')).toISOString()).toBe('2027-01-01T05:59:59.999Z');
    expect(getMexicoCityEndOfMonth(new Date('2028-02-10T20:00:00Z')).toISOString()).toBe('2028-03-01T05:59:59.999Z');
  });
});

describe('getMexicoCityRangeForDays', () => {
  it('de las 00:00 del primer día a las 23:59:59.999 del último', () => {
    const { start, end } = getMexicoCityRangeForDays('2026-10-01', '2026-10-15');
    expect(start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-16T05:59:59.999Z');
  });
});

describe('isValidYmd', () => {
  it.each([
    ['2026-10-15', true],
    ['2026-02-29', false],
    ['2028-02-29', true],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isValidYmd(value)).toBe(expected);
  });
});
