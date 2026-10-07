// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Reembolsos por grupo y suscripciones reemplazadas (SPEC-SPECIAL-PACKAGES §5.6, S1).
 */

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    query: { openClasses: { findFirst: vi.fn() }, userSubscriptions: { findFirst: vi.fn() }, users: { findFirst: vi.fn() } },
  },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/email/service', () => ({
  sendClassCancellationEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentRejectedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { cancelReservationAction } from '../enrollment';
import { cancelClassAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

const dialect = new PgDialect();
const render = (value: unknown) => dialect.sqlToQuery(value as SQL);
const nameOf = (table: unknown) => (table as Record<symbol, string>)[Symbol.for('drizzle:Name')];

const NOW = new Date('2026-10-07T10:00:00.000-06:00');
const HOUR = 60 * 60 * 1000;

type Write = { table: string; set?: Record<string, unknown>; sql?: string };

/** Transacción que registra cada escritura; el soft-cancel y el grupo devuelven una fila. */
function recordingTransaction() {
  const writes: Write[] = [];
  vi.mocked(db.transaction).mockImplementation((async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      execute: async (query: SQL) => {
        writes.push({ table: 'execute', sql: render(query).sql });
      },
      update: (table: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: () => {
            writes.push({ table: nameOf(table), set });
            const rows = Promise.resolve([{ id: 'row' }]);
            return Object.assign(rows, { returning: () => rows });
          },
        }),
      }),
      delete: () => ({ where: async () => undefined }),
    })) as never);
  return writes;
}

function clientCancellation(opts: { balanceId: string | null; active: boolean; createdAt?: Date; hoursUntilClass: number }) {
  let call = 0;
  vi.mocked(db.select).mockImplementation((() => {
    call++;
    if (call === 1) {
      return {
        from: () => ({
          innerJoin: () => ({
            where: async () => [
              {
                enrollment: {
                  id: 'enr-1',
                  openClassId: 'class-1',
                  userSubscriptionId: 'sub-1',
                  status: 'pending',
                  createdAt: opts.createdAt ?? new Date(NOW.getTime() - 3 * 24 * HOUR),
                  balanceId: opts.balanceId,
                },
                userSubscription: { id: 'sub-1', userId: 'user-1', active: opts.active },
              },
            ],
          }),
        }),
      };
    }
    if (call === 2) return { from: () => ({ leftJoin: () => ({ where: async () => [{ guest: false }] }) }) };
    return { from: () => ({ where: async () => [] }) };
  }) as never);
  vi.mocked(db.query.openClasses.findFirst).mockResolvedValue({
    id: 'class-1',
    classDate: new Date(NOW.getTime() + opts.hoursUntilClass * HOUR),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(getSession).mockResolvedValue({ sub: 'user-1', role: 'client', email: 'c@test.com' } as never);
});
afterEach(() => vi.useRealTimers());

describe('cancelación del cliente en paquetes especiales', () => {
  it('a tiempo (≥24 h): el crédito vuelve al mismo grupo y al total', async () => {
    clientCancellation({ balanceId: 'B', active: true, hoursUntilClass: 48 });
    const writes = recordingTransaction();

    const result = await cancelReservationAction('enr-1');

    expect(result).toEqual({ success: true, message: 'Reservación cancelada. Tu crédito ha sido restaurado.' });
    expect(writes.map((w) => w.table)).toEqual(['class_enrolleds', 'user_subscription_balances', 'execute']);
    expect(render(writes[1].set?.creditsRemaining).sql).toBe('credits_remaining + 1');
    expect(writes[2].sql).toMatch(/days_remaining = days_remaining \+ 1/);
  });

  it('dentro de los 10 min de gracia con la clase en 2 h: también vuelve al grupo', async () => {
    clientCancellation({ balanceId: 'A', active: true, hoursUntilClass: 2, createdAt: new Date(NOW.getTime() - 5 * 60 * 1000) });
    const writes = recordingTransaction();

    expect((await cancelReservationAction('enr-1')).success).toBe(true);
    expect(writes.map((w) => w.table)).toContain('user_subscription_balances');
  });

  it('tardía (<24 h y fuera de gracia): no hay reintegro y se pide confirmación', async () => {
    clientCancellation({ balanceId: 'B', active: true, hoursUntilClass: 2 });
    const writes = recordingTransaction();

    expect(await cancelReservationAction('enr-1')).toEqual({ success: false, error: 'LATE_CANCELLATION', field: 'late' });
    expect(writes).toHaveLength(0);
  });

  it('S1: con la suscripción reemplazada se cancela sin reintegro y con el mensaje acordado', async () => {
    clientCancellation({ balanceId: 'B', active: false, hoursUntilClass: 48 });
    const writes = recordingTransaction();

    expect(await cancelReservationAction('enr-1')).toEqual({
      success: true,
      message: 'Reserva cancelada. El crédito no se reintegra porque la suscripción con la que reservaste ya no está vigente.',
    });
    expect(writes.map((w) => w.table)).toEqual(['class_enrolleds']);
  });
});

describe('cancelClassAction (el Estudio cancela)', () => {
  function classWithEnrollments(rows: { userSubscriptionId: string; balanceId: string | null; subscriptionActive: boolean; isOpenLab: boolean }[]) {
    vi.mocked(getSession).mockResolvedValue({ sub: 'admin-1', role: 'admin', email: 'a@test.com' } as never);
    vi.mocked(db.query.openClasses.findFirst).mockResolvedValue({ id: 'class-1', status: 'scheduled', classType: 'yoga', classDate: new Date(NOW.getTime() + 48 * HOUR), coachUserId: null } as never);
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: () => ({ where: async () => rows.map((r, i) => ({ enrollmentId: `enr-${i}`, ...r })) }) } as never)
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) } as never);
    vi.mocked(db.query.userSubscriptions.findFirst).mockImplementation((async ({ where }: { where: unknown }) => {
      const id = render(where).params[0] as string;
      return { id, userId: `user-of-${id}` };
    }) as never);
    vi.mocked(db.query.users.findFirst).mockImplementation((async ({ where }: { where: unknown }) => {
      const id = render(where).params[0] as string;
      return { id, email: `${id}@test.com`, username: id === 'user-of-old' ? 'Ana' : 'Luis' };
    }) as never);
  }

  it('reintegra a cada alumno en su grupo; las suscripciones reemplazadas quedan para reposición manual', async () => {
    classWithEnrollments([
      { userSubscriptionId: 'current', balanceId: 'B', subscriptionActive: true, isOpenLab: false },
      { userSubscriptionId: 'old', balanceId: null, subscriptionActive: false, isOpenLab: false },
    ]);
    const writes = recordingTransaction();

    const result = await cancelClassAction('class-1');

    expect(result).toMatchObject({ success: true, data: { manualRestore: [{ userId: 'user-of-old', userName: 'Ana' }] } });
    expect(result.success && result.message).toContain('Repón la sesión manualmente a: Ana');
    expect(writes.filter((w) => w.table === 'user_subscription_balances')).toHaveLength(1);
    expect(writes.filter((w) => w.table === 'execute')).toHaveLength(1); // solo el total de "current"
  });

  it('H14: en Open Lab no toca days_remaining', async () => {
    classWithEnrollments([{ userSubscriptionId: 'openlab', balanceId: null, subscriptionActive: true, isOpenLab: true }]);
    const writes = recordingTransaction();

    expect((await cancelClassAction('class-1')).success).toBe(true);
    expect(writes.filter((w) => w.table === 'execute')).toHaveLength(0);
  });
});
