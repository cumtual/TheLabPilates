// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PgDialect } from 'drizzle-orm/pg-core';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}));

vi.mock('@/db', () => ({ db: { update: mocks.update } }));

import {
  buildAutoCloseWhere,
  getAutoCloseCutoff,
  markUnattendedEnrollmentsAbsent,
} from '@/lib/queries/attendance-auto-close';
import { ATTENDANCE_AUTO_CLOSE_FROM } from '@/lib/checkin/constants';

const dialect = new PgDialect();
const cdmxTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Mexico_City',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

describe('getAutoCloseCutoff', () => {
  it('es la medianoche CDMX del día en curso', () => {
    expect(getAutoCloseCutoff(new Date('2026-09-23T00:30:00.000-06:00'))).toEqual(
      new Date('2026-09-23T00:00:00.000-06:00')
    );
  });

  it('propiedad: cutoff ≤ now < cutoff + 24 h y cutoff es 00:00:00 en CDMX', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2030-12-31T23:59:59Z'), noInvalidDate: true }),
        (now) => {
          const cutoff = getAutoCloseCutoff(now);
          expect(cutoff.getTime()).toBeLessThanOrEqual(now.getTime());
          expect(now.getTime() - cutoff.getTime()).toBeLessThan(24 * 60 * 60 * 1000);
          expect(cutoff.getUTCMilliseconds()).toBe(0);
          expect(cdmxTime.format(cutoff)).toBe('00:00:00');
        }
      )
    );
  });

  it('frontera: una clase de hoy 23:10 no se cierra a las 23:59:59.999, sí a las 00:00 del día siguiente', () => {
    const classDate = new Date('2026-09-23T23:10:00.000-06:00');
    const lastMoment = getAutoCloseCutoff(new Date('2026-09-23T23:59:59.999-06:00'));
    const nextDay = getAutoCloseCutoff(new Date('2026-09-24T00:00:00.000-06:00'));
    expect(classDate < lastMoment).toBe(false);
    expect(classDate < nextDay).toBe(true);
  });
});

describe('buildAutoCloseWhere', () => {
  it('solo cierra reservas pending de clases no canceladas, desde el go-live y antes del corte', () => {
    const now = new Date('2026-10-05T00:15:00.000-06:00');
    const { sql, params } = dialect.sqlToQuery(buildAutoCloseWhere(now)!);

    expect(sql).toContain('"class_enrolleds"."open_class_id" = "open_class"."id"');
    expect(sql).toContain('"class_enrolleds"."status" = $1');
    expect(sql).toContain('"open_class"."status" in ($2, $3)');
    expect(sql).toContain('"open_class"."class_date" >= $4');
    expect(sql).toContain('"open_class"."class_date" < $5');
    expect(params[0]).toBe('pending');
    expect(params.slice(1, 3)).toEqual(['scheduled', 'completed']);
    expect(sql).not.toContain('cancelled');
    expect(params).toContain(ATTENDANCE_AUTO_CLOSE_FROM.toISOString());
    expect(params).toContain(new Date('2026-10-05T00:00:00.000-06:00').toISOString());
  });
});

describe('markUnattendedEnrollmentsAbsent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
  });

  it('marca absent, anula el token y devuelve cuántas reservas cerró', async () => {
    mocks.returning.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);

    const count = await markUnattendedEnrollmentsAbsent(new Date('2026-10-05T00:15:00.000-06:00'));

    expect(count).toBe(2);
    expect(mocks.set).toHaveBeenCalledWith({ status: 'absent', checkinToken: null });
    expect(mocks.update).toHaveBeenCalledTimes(1); // una sola sentencia: atómica
  });

  it('es idempotente: sin pendientes devuelve 0', async () => {
    mocks.returning.mockResolvedValue([]);
    await expect(markUnattendedEnrollmentsAbsent()).resolves.toBe(0);
  });
});
