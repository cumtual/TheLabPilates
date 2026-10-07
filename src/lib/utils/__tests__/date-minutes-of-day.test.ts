// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { getMexicoCityMinutesOfDay, minutesToHHMM, hhmmToMinutes } from '../date';

describe('getMexicoCityMinutesOfDay', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('convierte instantes UTC a minutos del día CDMX', () => {
    expect(getMexicoCityMinutesOfDay(new Date('2026-10-07T13:00:00Z'))).toBe(420); // 07:00
    expect(getMexicoCityMinutesOfDay(new Date('2026-10-07T17:00:00Z'))).toBe(660); // 11:00
    expect(getMexicoCityMinutesOfDay(new Date('2026-10-08T05:59:00Z'))).toBe(1439); // 23:59 del 7
    expect(getMexicoCityMinutesOfDay('2026-10-08T06:00:00Z')).toBe(0); // 00:00 del 8
  });

  it('no depende de la zona horaria del servidor', () => {
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
      process.env.TZ = tz;
      expect(getMexicoCityMinutesOfDay(new Date('2026-10-07T13:30:00Z'))).toBe(450);
    }
  });

  it('convierte entre HH:MM y minutos', () => {
    expect(hhmmToMinutes('07:00')).toBe(420);
    expect(hhmmToMinutes('11:00:00')).toBe(660); // formato `time` de PostgreSQL
    expect(minutesToHHMM(420)).toBe('07:00');
    expect(minutesToHHMM(1439)).toBe('23:59');
  });
});
