// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), update: vi.fn() }));
vi.mock('@/db', () => ({ db: { transaction: mocks.transaction, update: mocks.update } }));

import { guestEnrollments } from '@/db/schema';
import {
  buildGuestAutoCloseWhere,
  createGuestCheckinRepository,
  drizzleGuestAutoClose,
  drizzleGuestCheckinUnitOfWork,
} from '../drizzle-guest-checkin-repository';
import { toGuestAttendanceSet } from '../attendance-set';
import { guestAttendanceTransition } from '../../domain/guest-attendance';

const dialect = new PgDialect();
const TOKEN = 'b'.repeat(64);
const render = (chunk: unknown) => dialect.sqlToQuery(chunk as SQL);

function createSelectTx(rows: unknown[]) {
  const builder = { from: vi.fn(), innerJoin: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), limit: vi.fn(), for: vi.fn() };
  for (const key of ['from', 'innerJoin', 'leftJoin', 'where', 'limit'] as const) builder[key].mockReturnValue(builder);
  builder.for.mockResolvedValue(rows);
  return { tx: { select: vi.fn().mockReturnValue(builder) }, builder };
}

function createUpdateTx(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { tx: { update: vi.fn().mockReturnValue({ set }) }, set, where };
}

describe('createGuestCheckinRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findByTokenForUpdate bloquea solo la fila del invitado (FOR UPDATE OF guest_enrollments)', async () => {
    const row = { guestEnrollmentId: 'g1', guestName: 'María' };
    const { tx, builder } = createSelectTx([row]);

    await expect(createGuestCheckinRepository(tx as never).findByTokenForUpdate(TOKEN)).resolves.toEqual(row);
    expect(builder.innerJoin).toHaveBeenCalledTimes(1);
    expect(builder.leftJoin).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(builder.for).toHaveBeenCalledWith('update', { of: guestEnrollments });
    const where = render(builder.where.mock.calls[0][0]);
    expect(where.sql).toBe('"guest_enrollments"."checkin_token" = $1');
    expect(where.params).toEqual([TOKEN]);
  });

  it('findByTokenForUpdate devuelve null si el token no existe', async () => {
    const { tx } = createSelectTx([]);
    await expect(createGuestCheckinRepository(tx as never).findByTokenForUpdate(TOKEN)).resolves.toBeNull();
  });

  it('markAttended fija attended, now(), el actor y anula el token, con guardas de id, pending y token', async () => {
    const checkedInAt = new Date();
    const { tx, set, where } = createUpdateTx([{ checkedInAt }]);

    const result = await createGuestCheckinRepository(tx as never).markAttended({
      guestEnrollmentId: 'g1',
      token: TOKEN,
      actorId: 'coach-1',
    });

    expect(result).toBe(checkedInAt);
    const values = set.mock.calls[0][0];
    expect(values.status).toBe('attended');
    expect(values.checkedInById).toBe('coach-1');
    expect(values.checkinToken).toBeNull();
    expect(render(values.checkedInAt).sql).toBe('now()');
    const guard = render(where.mock.calls[0][0]);
    expect(guard.sql).toBe(
      '("guest_enrollments"."id" = $1 and "guest_enrollments"."status" = $2 and "guest_enrollments"."checkin_token" = $3)'
    );
    expect(guard.params).toEqual(['g1', 'pending', TOKEN]);
  });

  it('markAttended devuelve null si ninguna fila cumple las guardas', async () => {
    const { tx } = createUpdateTx([]);
    await expect(
      createGuestCheckinRepository(tx as never).markAttended({ guestEnrollmentId: 'g1', token: TOKEN, actorId: 'a' })
    ).resolves.toBeNull();
  });

  it('el unit of work corre el trabajo dentro de db.transaction', async () => {
    mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work({}));
    await expect(drizzleGuestCheckinUnitOfWork.run(async () => 'done')).resolves.toBe('done');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('cierre automático de invitados', () => {
  const range = {
    from: new Date('2026-11-18T00:00:00.000-06:00'),
    cutoff: new Date('2026-11-20T00:00:00.000-06:00'),
  };

  it('solo invitados pending de clases no canceladas dentro del rango', () => {
    const where = render(buildGuestAutoCloseWhere(range));
    expect(where.sql).toBe(
      '("guest_enrollments"."open_class_id" = "open_class"."id" and "guest_enrollments"."status" = $1 and "open_class"."status" in ($2, $3) and "open_class"."class_date" >= $4 and "open_class"."class_date" < $5)'
    );
    expect(where.params.slice(0, 3)).toEqual(['pending', 'scheduled', 'completed']);
  });

  it('pasa a absent, anula el token y devuelve el conteo', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const from = vi.fn().mockReturnValue({ where });
    const set = vi.fn().mockReturnValue({ from });
    mocks.update.mockReturnValue({ set });

    await expect(drizzleGuestAutoClose.markUnattendedAbsent(range)).resolves.toBe(2);
    expect(mocks.update).toHaveBeenCalledWith(guestEnrollments);
    expect(set).toHaveBeenCalledWith({ status: 'absent', checkinToken: null });
  });
});

describe('toGuestAttendanceSet', () => {
  it('attended conserva el primer check-in con coalesce y anula el token', () => {
    const values = toGuestAttendanceSet(guestAttendanceTransition('attended', 'coach-1'));
    expect(values.status).toBe('attended');
    expect(values.checkinToken).toBeNull();
    expect(render(values.checkedInAt).sql).toBe('coalesce("guest_enrollments"."checked_in_at", now())');
    const by = render(values.checkedInById);
    expect(by.sql).toBe('coalesce("guest_enrollments"."checked_in_by", $1::uuid)');
    expect(by.params).toEqual(['coach-1']);
  });

  it('absent limpia momento, actor y token', () => {
    expect(toGuestAttendanceSet(guestAttendanceTransition('absent', 'coach-1'))).toEqual({
      status: 'absent',
      checkedInAt: null,
      checkedInById: null,
      checkinToken: null,
    });
  });
});
