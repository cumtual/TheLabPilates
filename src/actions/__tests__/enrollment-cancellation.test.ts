// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Auditoría de cancelaciones del cliente (SPEC-CANCELLATION-AUDIT-AND-TERMS §3.2).
 * Usa drizzle-orm REAL para verificar el SQL de `cancelled_at` y de la guardia.
 */

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    query: { openClasses: { findFirst: vi.fn() } },
  },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));

import { cancelReservationAction, confirmLateCancellationAction } from '../enrollment';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

const dialect = new PgDialect();
const toQuery = (value: unknown) => dialect.sqlToQuery(value as SQL);

const OWNER = 'user-1';
const ENROLLMENT_ID = 'enrollment-1';
const NOW = new Date('2026-09-24T10:00:00.000-06:00');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

type Captured = { set?: Record<string, unknown>; where?: unknown };

function setupSelects(createdAt: Date, isOpenLab = false) {
  let call = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    call++;
    if (call === 1) {
      return {
        from: () => ({
          innerJoin: () => ({
            where: vi.fn().mockResolvedValue([
              {
                enrollment: {
                  id: ENROLLMENT_ID,
                  openClassId: 'class-1',
                  userSubscriptionId: 'sub-1',
                  status: 'pending',
                  createdAt,
                },
                userSubscription: { id: 'sub-1', userId: OWNER, active: true },
              },
            ]),
          }),
        }),
      };
    }
    if (call === 2) {
      return { from: () => ({ leftJoin: () => ({ where: vi.fn().mockResolvedValue([{ guest: isOpenLab }]) }) }) };
    }
    return { from: () => ({ where: vi.fn().mockResolvedValue([]) }) };
  });
}

function setupClass(classDate: Date) {
  (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'class-1', classDate });
}

/** Transacción con soft-cancel capturado; `returningRows` simula filas actualizadas. */
function setupTransaction(returningRows: unknown[] = [{ id: ENROLLMENT_ID }]) {
  const captured: Captured = {};
  const execute = vi.fn().mockResolvedValue(undefined);
  const txDelete = vi.fn();
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      delete: txDelete,
      execute,
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          captured.set = patch;
          return {
            where: (cond: unknown) => {
              captured.where = cond;
              return { returning: vi.fn().mockResolvedValue(returningRows) };
            },
          };
        },
      }),
    })
  );
  return { captured, execute, txDelete };
}

function setupDirectUpdate(returningRows: unknown[] = [{ id: ENROLLMENT_ID }]) {
  const captured: Captured = {};
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
    set: (patch: Record<string, unknown>) => {
      captured.set = patch;
      return {
        where: (cond: unknown) => {
          captured.where = cond;
          return { returning: vi.fn().mockResolvedValue(returningRows) };
        },
      };
    },
  });
  return captured;
}

function expectCancellationAudit(captured: Captured, status: 'cancelled' | 'late_cancelled') {
  expect(captured.set?.status).toBe(status);
  expect(toQuery(captured.set?.cancelledAt).sql).toBe('now()');
  expect(captured.set?.checkinToken).toBeNull();
  const where = toQuery(captured.where);
  expect(where.sql).toMatch(/"class_enrolleds"\."id" = \$1 and "class_enrolleds"\."status" = \$2/);
  expect(where.params).toEqual([ENROLLMENT_ID, 'pending']);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ sub: OWNER, role: 'client', email: 'c@test.com' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cancelled_at se registra al cancelar', () => {
  it('cancelación a tiempo (≥24 h): soft-cancel con cancelled_at = now(), sin DELETE', async () => {
    setupSelects(new Date(NOW.getTime() - 3 * 24 * HOUR));
    setupClass(new Date(NOW.getTime() + 48 * HOUR));
    const { captured, execute, txDelete } = setupTransaction();

    const result = await cancelReservationAction(ENROLLMENT_ID);

    expect(result.success).toBe(true);
    expectCancellationAudit(captured, 'cancelled');
    expect(txDelete).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1); // days_remaining + 1
  });

  it('cancelación tardía confirmada: late_cancelled con cancelled_at = now() y sin reembolso', async () => {
    setupSelects(new Date(NOW.getTime() - 30 * MIN));
    setupClass(new Date(NOW.getTime() + 2 * HOUR));
    const captured = setupDirectUpdate();

    const result = await confirmLateCancellationAction(ENROLLMENT_ID);

    expect(result.success).toBe(true);
    expectCancellationAudit(captured, 'late_cancelled');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('Open Lab: registra cancelled_at sin tocar days_remaining', async () => {
    setupSelects(new Date(NOW.getTime() - 3 * 24 * HOUR), true);
    setupClass(new Date(NOW.getTime() + 48 * HOUR));
    const { captured, execute } = setupTransaction();

    const result = await cancelReservationAction(ENROLLMENT_ID);

    expect(result.success).toBe(true);
    expectCancellationAudit(captured, 'cancelled');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('idempotencia: sin doble reembolso', () => {
  it('si otro request ya canceló (0 filas), no reembolsa y responde error controlado', async () => {
    setupSelects(new Date(NOW.getTime() - 3 * 24 * HOUR));
    setupClass(new Date(NOW.getTime() + 48 * HOUR));
    const { execute } = setupTransaction([]);

    const result = await cancelReservationAction(ENROLLMENT_ID);

    expect(result).toEqual({ success: false, error: 'Esta reservación ya fue cancelada.' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('confirmación tardía repetida (0 filas) responde error controlado', async () => {
    setupSelects(new Date(NOW.getTime() - 30 * MIN));
    setupClass(new Date(NOW.getTime() + 2 * HOUR));
    setupDirectUpdate([]);

    const result = await confirmLateCancellationAction(ENROLLMENT_ID);

    expect(result).toEqual({ success: false, error: 'Esta reservación ya fue cancelada.' });
  });
});

describe('ventana de gracia de 10 minutos', () => {
  it('límite inclusivo: exactamente 10:00.000 min tras reservar, clase en 2 h → reembolso', async () => {
    setupSelects(new Date(NOW.getTime() - 10 * MIN));
    setupClass(new Date(NOW.getTime() + 2 * HOUR));
    const { captured, execute } = setupTransaction();

    const result = await cancelReservationAction(ENROLLMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.message).toContain('10 minutos');
    expectCancellationAudit(captured, 'cancelled');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('10:00.001 min tras reservar, clase en 2 h → LATE_CANCELLATION sin reembolso', async () => {
    setupSelects(new Date(NOW.getTime() - 10 * MIN - 1));
    setupClass(new Date(NOW.getTime() + 2 * HOUR));
    setupTransaction();

    const result = await cancelReservationAction(ENROLLMENT_ID);

    expect(result).toEqual({ success: false, error: 'LATE_CANCELLATION', field: 'late' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('fuera de gracia pero con exactamente 24 h de anticipación → reembolso', async () => {
    setupSelects(new Date(NOW.getTime() - 3 * 24 * HOUR));
    setupClass(new Date(NOW.getTime() + 24 * HOUR));
    const { execute } = setupTransaction();

    const result = await cancelReservationAction(ENROLLMENT_ID);

    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('confirmar la tardía aún dentro de la gracia → reembolsa (re-evaluación)', async () => {
    setupSelects(new Date(NOW.getTime() - 9 * MIN));
    setupClass(new Date(NOW.getTime() + 2 * HOUR));
    const { captured, execute } = setupTransaction();

    const result = await confirmLateCancellationAction(ENROLLMENT_ID);

    expect(result.success).toBe(true);
    expectCancellationAudit(captured, 'cancelled');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('propiedad: con la clase a <24 h, reembolsa ⇔ han pasado ≤10 min desde la reserva', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 20 * MIN }), async (elapsedMs) => {
        vi.clearAllMocks();
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ sub: OWNER, role: 'client', email: 'c@test.com' });
        setupSelects(new Date(NOW.getTime() - elapsedMs));
        setupClass(new Date(NOW.getTime() + 5 * HOUR));
        const { execute } = setupTransaction();

        const result = await cancelReservationAction(ENROLLMENT_ID);

        if (elapsedMs <= 10 * MIN) {
          expect(result.success).toBe(true);
          expect(execute).toHaveBeenCalledTimes(1);
        } else {
          expect(result).toEqual({ success: false, error: 'LATE_CANCELLATION', field: 'late' });
          expect(execute).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 60 }
    );
  });
});
