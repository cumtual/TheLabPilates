// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Re-reserva tras cancelar (SPEC-CANCELLATION-AUDIT-AND-TERMS §3.3, D1-A).
 * La cancelación ahora conserva la fila, y el índice único
 * uk_class_user_enrollment (open_class_id, user_suscription_id) impediría un INSERT
 * nuevo: la fila cancelada se REACTIVA dentro de la misma transacción.
 */

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
    query: { openClasses: { findFirst: vi.fn() } },
  },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/guest/capacity', () => ({ getAvailableCapacity: vi.fn().mockResolvedValue(5) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));

import { enrollInClassAction } from '../enrollment';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

const dialect = new PgDialect();
const toQuery = (value: unknown) => dialect.sqlToQuery(value as SQL);
const creditDecrements = (execute: ReturnType<typeof vi.fn>) =>
  execute.mock.calls.filter(([query]) => toQuery(query).sql.includes('days_remaining - 1')).length;

const CLASS_ID = 'class-1';
const SUB_ID = 'sub-1';

function setupPrerequisites() {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let call = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    call++;
    if (call === 1) {
      return {
        from: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: vi.fn().mockResolvedValue([
                {
                  userSub: { id: SUB_ID, daysRemaining: 5, active: true, expirationDate: future, userId: 'user-1' },
                  payment: { confirmed: true },
                  subscription: { guest: false },
                },
              ]),
            }),
          }),
        }),
      };
    }
    return { from: () => ({ innerJoin: () => ({ where: vi.fn().mockResolvedValue([]) }) }) };
  });
  (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: CLASS_ID,
    status: 'scheduled',
    classDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  });
}

function setupTransaction(reactivatedRows: unknown[]) {
  const state: { set?: Record<string, unknown>; where?: unknown; inserted?: Record<string, unknown> } = {};
  const execute = vi.fn().mockResolvedValue(undefined);
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      execute,
      rollback: vi.fn(),
      select: () => ({ from: () => ({ innerJoin: () => ({ where: vi.fn().mockResolvedValue([]) }) }) }),
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          state.set = patch;
          return {
            where: (cond: unknown) => {
              state.where = cond;
              return { returning: vi.fn().mockResolvedValue(reactivatedRows) };
            },
          };
        },
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          state.inserted = values;
          return Promise.resolve(undefined);
        },
      }),
    })
  );
  return { state, execute };
}

beforeEach(() => {
  vi.clearAllMocks();
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ sub: 'user-1', role: 'client', email: 'c@test.com' });
  setupPrerequisites();
});

describe('enrollInClassAction — reactivación de una inscripción cancelada', () => {
  it('si hay una fila cancelada para (clase, suscripción), la reactiva sin INSERT', async () => {
    const { state, execute } = setupTransaction([{ id: 'enrollment-old' }]);

    const result = await enrollInClassAction(CLASS_ID);

    expect(result.success).toBe(true);
    expect(state.inserted).toBeUndefined();
    expect(creditDecrements(execute)).toBe(1);

    expect(state.set?.status).toBe('pending');
    expect(toQuery(state.set?.createdAt).sql).toBe('now()'); // la gracia corre desde la nueva reserva
    expect(state.set?.cancelledAt).toBeNull();
    expect(state.set?.checkedInAt).toBeNull();
    expect(state.set?.checkinToken).toMatch(/^[0-9a-f]{64}$/);

    const where = toQuery(state.where);
    expect(where.sql).toContain('"class_enrolleds"."open_class_id" = $1');
    expect(where.sql).toContain('"class_enrolleds"."user_suscription_id" = $2');
    expect(where.sql).toContain('"class_enrolleds"."status" in ($3, $4)');
    expect(where.params).toEqual([CLASS_ID, SUB_ID, 'cancelled', 'late_cancelled']);
  });

  it('sin fila cancelada previa, inserta una inscripción nueva con token', async () => {
    const { state, execute } = setupTransaction([]);

    const result = await enrollInClassAction(CLASS_ID);

    expect(result.success).toBe(true);
    expect(state.inserted).toMatchObject({ openClassId: CLASS_ID, userSubscriptionId: SUB_ID, status: 'pending' });
    expect(state.inserted?.checkinToken).toMatch(/^[0-9a-f]{64}$/);
    expect(creditDecrements(execute)).toBe(1);
  });
});
