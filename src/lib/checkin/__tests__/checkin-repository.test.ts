// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('@/db', () => ({ db: { transaction: mocks.transaction } }));

import { classEnrollments } from '@/db/schema';
import { createCheckinRepository, runCheckinTransaction } from '@/lib/checkin/checkin-repository';

const dialect = new PgDialect();
const TOKEN = 'a'.repeat(64);

function render(sqlChunk: unknown) {
  return dialect.sqlToQuery(sqlChunk as SQL);
}

/** Cadena select().from().innerJoin()×3.where().limit().for() */
function createSelectTx(rows: unknown[]) {
  const builder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn(),
  };
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.for.mockResolvedValue(rows);
  return { tx: { select: vi.fn().mockReturnValue(builder) }, builder };
}

function createUpdateTx(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { tx: { update: vi.fn().mockReturnValue({ set }) }, set, where };
}

describe('createCheckinRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findByTokenForUpdate bloquea la fila de la reserva (FOR UPDATE OF class_enrolleds)', async () => {
    const row = { enrollmentId: 'e1', studentName: 'Ana' };
    const { tx, builder } = createSelectTx([row]);

    const result = await createCheckinRepository(tx as never).findByTokenForUpdate(TOKEN);

    expect(result).toEqual(row);
    expect(builder.innerJoin).toHaveBeenCalledTimes(3);
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(builder.for).toHaveBeenCalledWith('update', { of: classEnrollments });
    const where = render(builder.where.mock.calls[0][0]);
    expect(where.sql).toBe('"class_enrolleds"."checkin_token" = $1');
    expect(where.params).toEqual([TOKEN]);
  });

  it('findByTokenForUpdate devuelve null si el token no existe', async () => {
    const { tx } = createSelectTx([]);
    await expect(createCheckinRepository(tx as never).findByTokenForUpdate(TOKEN)).resolves.toBeNull();
  });

  it('markAttended marca attended, fija checked_in_at = now() y anula el token con guardas', async () => {
    const checkedInAt = new Date();
    const { tx, set, where } = createUpdateTx([{ checkedInAt }]);

    const result = await createCheckinRepository(tx as never).markAttended('e1', TOKEN);

    expect(result).toBe(checkedInAt);
    const values = set.mock.calls[0][0];
    expect(values.status).toBe('attended');
    expect(values.checkinToken).toBeNull();
    expect(render(values.checkedInAt).sql).toBe('now()');
    const guard = render(where.mock.calls[0][0]);
    expect(guard.sql).toContain('"class_enrolleds"."id" = $1');
    expect(guard.sql).toContain('"class_enrolleds"."status" = $2');
    expect(guard.sql).toContain('"class_enrolleds"."checkin_token" = $3');
    expect(guard.params).toEqual(['e1', 'pending', TOKEN]);
  });

  it('markAttended devuelve null si las guardas no coinciden (token ya usado)', async () => {
    const { tx } = createUpdateTx([]);
    await expect(createCheckinRepository(tx as never).markAttended('e1', TOKEN)).resolves.toBeNull();
  });
});

describe('runCheckinTransaction', () => {
  it('ejecuta el trabajo dentro de db.transaction', async () => {
    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({}));
    const result = await runCheckinTransaction(async (repo) => typeof repo.findByTokenForUpdate);
    expect(result).toBe('function');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
