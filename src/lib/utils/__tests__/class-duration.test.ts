import { describe, it, expect } from 'vitest';
import {
  CLASS_DURATION_MINUTES,
  CLASS_DURATION_MS,
  getClassEndTime,
  formatTimeWithMeridiem,
} from '../date';

describe('CLASS_DURATION constants', () => {
  it('official class duration is 50 minutes', () => {
    expect(CLASS_DURATION_MINUTES).toBe(50);
    expect(CLASS_DURATION_MS).toBe(50 * 60 * 1000);
  });
});

describe('getClassEndTime', () => {
  it('adds exactly 50 minutes to the start instant', () => {
    const start = new Date('2026-01-15T09:30:00-06:00');
    const end = getClassEndTime(start);

    expect((end.getTime() - start.getTime()) / (1000 * 60)).toBe(50);
    expect(end.toISOString()).toBe(new Date('2026-01-15T10:20:00-06:00').toISOString());
  });

  it('renders 09:30 → 10:20 (morning) in America/Mexico_City', () => {
    const start = new Date('2026-01-15T09:30:00-06:00');
    const end = getClassEndTime(start);

    expect(`${formatTimeWithMeridiem(start)} - ${formatTimeWithMeridiem(end)}`).toBe(
      '09:30 A.M. - 10:20 A.M.'
    );
  });

  it('renders 16:20 → 17:10 (afternoon) in America/Mexico_City', () => {
    const start = new Date('2026-01-15T16:20:00-06:00');
    const end = getClassEndTime(start);

    expect(`${formatTimeWithMeridiem(start)} - ${formatTimeWithMeridiem(end)}`).toBe(
      '04:20 P.M. - 05:10 P.M.'
    );
  });
});
