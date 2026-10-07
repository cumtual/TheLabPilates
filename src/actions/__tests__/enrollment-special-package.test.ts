// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Motor de reserva por disciplina (SPEC-SPECIAL-PACKAGES §5.3). Se simula la BD en
 * memoria: grupos del Reset Pass, reservas y la suscripción, con las mismas guardas
 * que aplica PostgreSQL (`credits_remaining > 0`, `days_remaining > 0`).
 */

vi.mock('@/db', () => ({
  db: { select: vi.fn(), transaction: vi.fn(), query: { openClasses: { findFirst: vi.fn() } } },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/guest/capacity', () => ({ getAvailableCapacity: vi.fn().mockResolvedValue(5) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));

import { enrollInClassAction } from '../enrollment';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

const dialect = new PgDialect();
const params = (where: unknown) => dialect.sqlToQuery(where as SQL).params;
const nameOf = (table: unknown) => (table as Record<symbol, string>)[Symbol.for('drizzle:Name')];

const SUB_ID = 'sub-1';
const at = (hhmm: string, day = 9) => new Date(`2026-10-${String(day).padStart(2, '0')}T${hhmm}:00-06:00`);

type Balance = { id: string; label: string | null; allowedClassTypes: string[]; windowStart: string | null; windowEnd: string | null; creditsRemaining: number; creditsTotal: number; sortOrder: number; userSubscriptionId: string };
type World = {
  balances: Balance[];
  daysRemaining: number;
  enrollments: { classId: string; balanceId: string | null; status: string }[];
  classes: Record<string, { id: string; status: string; classType: string; classDate: Date }>;
  /** Se ejecuta al abrir la transacción (simula otra pestaña que reservó antes). */
  onTransaction?: (world: World) => void;
  failTotalGuard?: boolean;
};

let world: World;

function resetPass(): Balance[] {
  return [
    { id: 'A', label: null, allowedClassTypes: ['yoga'], windowStart: null, windowEnd: null, creditsRemaining: 1, creditsTotal: 1, sortOrder: 0, userSubscriptionId: SUB_ID },
    { id: 'B', label: null, allowedClassTypes: ['mat_pilates', 'barre'], windowStart: null, windowEnd: null, creditsRemaining: 1, creditsTotal: 1, sortOrder: 1, userSubscriptionId: SUB_ID },
  ];
}

function addClass(id: string, classType: string, classDate: Date) {
  world.classes[id] = { id, status: 'scheduled', classType, classDate };
}

function activeEnrollmentFor(classId: string) {
  return world.enrollments.filter((e) => e.classId === classId && e.status === 'pending').map(() => ({ id: 'e' }));
}

/** select() de lectura: suscripción (join), grupos o duplicados, según la forma de la consulta. */
function selectBuilder() {
  return {
    from: (table: unknown) => ({
      leftJoin: () => ({
        leftJoin: () => ({
          where: async () => [
            {
              userSub: { id: SUB_ID, daysRemaining: world.daysRemaining, active: true, expirationDate: at('10:00', 21), userId: 'user-1' },
              payment: { confirmed: true },
              subscription: { guest: false, kind: 'special', name: 'Reset Pass' },
            },
          ],
        }),
      }),
      innerJoin: () => ({ where: async (where: unknown) => activeEnrollmentFor(params(where)[0] as string) }),
      where: async () => {
        expect(nameOf(table)).toBe('user_subscription_balances');
        return world.balances.map((b) => ({ ...b }));
      },
    }),
  };
}

function setupDb() {
  vi.mocked(db.select).mockImplementation(selectBuilder as never);
  vi.mocked(db.query.openClasses.findFirst).mockImplementation((async ({ where }: { where: unknown }) => world.classes[params(where)[0] as string]) as never);
  vi.mocked(db.transaction).mockImplementation((async (cb: (tx: unknown) => Promise<unknown>) => {
    world.onTransaction?.(world);
    const snapshot = structuredClone({ balances: world.balances, daysRemaining: world.daysRemaining, enrollments: world.enrollments });
    const tx = {
      execute: vi.fn(async () => []),
      rollback: () => {
        throw new Error('Rollback');
      },
      select: selectBuilder,
      update: (table: unknown) => ({
        set: (patch: Record<string, unknown>) => ({
          where: (where: unknown) => {
            const [id] = params(where) as string[];
            let rows: unknown[] = [];
            if (nameOf(table) === 'user_subscription_balances') {
              const balance = world.balances.find((b) => b.id === id);
              if (balance && balance.creditsRemaining > 0) {
                balance.creditsRemaining -= 1;
                rows = [{ id }];
              }
            } else if (nameOf(table) === 'user_suscriptions') {
              if (!world.failTotalGuard && world.daysRemaining > 0) {
                world.daysRemaining -= 1;
                rows = [{ id }];
              }
            } else if (nameOf(table) === 'class_enrolleds' && patch.status === 'pending') {
              const cancelled = world.enrollments.find((e) => e.classId === id && e.status === 'cancelled');
              if (cancelled) {
                cancelled.status = 'pending';
                cancelled.balanceId = patch.balanceId as string | null;
                rows = [{ id: 'reactivated' }];
              }
            }
            return Object.assign(Promise.resolve(rows), { returning: async () => rows });
          },
        }),
      }),
      insert: () => ({
        values: async (values: { openClassId: string; balanceId?: string }) => {
          world.enrollments.push({ classId: values.openClassId, balanceId: values.balanceId ?? null, status: 'pending' });
        },
      }),
    };
    try {
      return await cb(tx);
    } catch (error) {
      Object.assign(world, snapshot); // ROLLBACK
      throw error;
    }
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T10:00:00.000-06:00'));
  world = { balances: resetPass(), daysRemaining: 2, enrollments: [], classes: {} };
  vi.mocked(getSession).mockResolvedValue({ sub: 'user-1', role: 'client', email: 'c@test.com' } as never);
  setupDb();
});

const groups = () => world.balances.map((b) => b.creditsRemaining).join('/');

describe('enrollInClassAction — Reset Pass (1 Yoga + 1 de [Mat | Barre])', () => {
  it('reproduce la traza de SPEC §5.3', async () => {
    addClass('mat-1', 'mat_pilates', at('09:00'));
    addClass('barre-1', 'barre', at('10:00'));
    addClass('mat-2', 'mat_pilates', at('11:00'));
    addClass('sculpt-1', 'sculpt', at('12:00'));
    addClass('yoga-1', 'yoga', at('13:00'));

    expect(await enrollInClassAction('mat-1')).toEqual({ success: true, message: '¡Reservación confirmada!', data: { balanceId: 'B' } });
    expect(groups()).toBe('1/0');

    expect(await enrollInClassAction('barre-1')).toEqual({
      success: false,
      code: 'GROUP_EXHAUSTED',
      error: 'Tu Reset Pass ya no incluye clases de Mat Pilates / Barre. Te queda: 1 clase de Yoga.',
    });
    expect(await enrollInClassAction('mat-2')).toMatchObject({ success: false, code: 'GROUP_EXHAUSTED' });
    expect(await enrollInClassAction('sculpt-1')).toMatchObject({
      success: false,
      code: 'CLASS_TYPE_NOT_INCLUDED',
      error: 'Tu Reset Pass no incluye clases de Sculpt. Te queda: 1 clase de Yoga.',
    });
    expect(groups()).toBe('1/0');

    expect(await enrollInClassAction('yoga-1')).toMatchObject({ success: true, data: { balanceId: 'A' } });
    expect(groups()).toBe('0/0');
    expect(world.daysRemaining).toBe(0);
    expect(world.enrollments.map((e) => `${e.classId}:${e.balanceId}`)).toEqual(['mat-1:B', 'yoga-1:A']);
  });

  it('franja horaria (D1): Yoga a las 11:00 entra; a las 11:01 no', async () => {
    world.balances = [{ ...resetPass()[0], windowStart: '07:00:00', windowEnd: '11:00:00' }];
    world.daysRemaining = 1;
    addClass('yoga-late', 'yoga', at('11:01'));
    addClass('yoga-edge', 'yoga', at('11:00'));

    expect(await enrollInClassAction('yoga-late')).toEqual({
      success: false,
      code: 'OUTSIDE_TIME_WINDOW',
      error: 'Tu crédito de Yoga solo aplica a clases que inician entre 07:00 y 11:00.',
    });
    expect(await enrollInClassAction('yoga-edge')).toMatchObject({ success: true, data: { balanceId: 'A' } });
  });

  it('la misma clase dos veces en un grupo combinado: la segunda se rechaza y el grupo baja una sola vez', async () => {
    world.balances = [{ ...resetPass()[1], creditsRemaining: 2, creditsTotal: 2 }];
    addClass('mat-1', 'mat_pilates', at('09:00'));

    expect((await enrollInClassAction('mat-1')).success).toBe(true);
    expect(await enrollInClassAction('mat-1')).toEqual({ success: false, error: 'Ya estás inscrito en esta clase.' });
    expect(groups()).toBe('1');
    expect(world.daysRemaining).toBe(1);
  });

  it('concurrencia: si otra reserva gana el grupo antes del bloqueo, rollback con GROUP_EXHAUSTED y sin INSERT', async () => {
    addClass('barre-1', 'barre', at('10:00'));
    world.onTransaction = (w) => {
      w.balances.find((b) => b.id === 'B')!.creditsRemaining = 0; // la otra pestaña reservó Mat
      w.daysRemaining = 1;
      w.onTransaction = undefined;
    };

    expect(await enrollInClassAction('barre-1')).toMatchObject({ success: false, code: 'GROUP_EXHAUSTED' });
    expect(world.enrollments).toHaveLength(0);
    expect(world.daysRemaining).toBe(1);
  });

  it('atomicidad: si la guarda del total falla, se revierte el grupo y no hay reserva', async () => {
    addClass('yoga-1', 'yoga', at('13:00'));
    world.failTotalGuard = true;

    expect(await enrollInClassAction('yoga-1')).toMatchObject({ success: false, code: 'NO_CREDITS' });
    expect(groups()).toBe('1/1');
    expect(world.enrollments).toHaveLength(0);
  });

  it('reactivar una reserva cancelada guarda el grupo de la nueva reserva', async () => {
    addClass('barre-1', 'barre', at('10:00'));
    world.enrollments.push({ classId: 'barre-1', balanceId: 'A', status: 'cancelled' });

    expect(await enrollInClassAction('barre-1')).toMatchObject({ success: true, data: { balanceId: 'B' } });
    expect(world.enrollments).toEqual([{ classId: 'barre-1', balanceId: 'B', status: 'pending' }]);
  });
});
