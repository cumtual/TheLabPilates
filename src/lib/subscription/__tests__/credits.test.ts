// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  activateBalances,
  adjustCreditManually,
  balanceRowsFromRules,
  buildSubscriptionSnapshot,
  BookingRejectionError,
  consumeClassCredit,
  expireOtherActiveSubscriptions,
  restoreEnrollmentCredit,
  type CreditExecutor,
} from '../credits';

/**
 * Módulo único de escritura de créditos (SPEC-SPECIAL-PACKAGES §5.5, INV-1, INV-3, INV-5).
 * Se usa un ejecutor falso que registra cada sentencia en orden.
 */

const dialect = new PgDialect();
const at = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00-06:00`);

type Call = { kind: 'execute' | 'select' | 'update' | 'insert'; table?: string; set?: Record<string, unknown>; where?: string; values?: unknown };

function tableName(table: unknown): string {
  return (table as Record<symbol, string>)[Symbol.for('drizzle:Name')];
}

function render(fragment: SQL | undefined): string {
  return fragment ? dialect.sqlToQuery(fragment).sql : '';
}

/** Ejecutor falso: `selectRows` alimenta cada select en orden; `updateRows` cada `returning`. */
function fakeExecutor(opts: { selectRows?: unknown[][]; updateRows?: unknown[][] } = {}) {
  const calls: Call[] = [];
  const selectQueue = [...(opts.selectRows ?? [])];
  const updateQueue = [...(opts.updateRows ?? [])];
  const executor = {
    execute: vi.fn(async (query: SQL) => {
      calls.push({ kind: 'execute', where: render(query) });
      return [];
    }),
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: async (where: SQL) => {
          calls.push({ kind: 'select', table: tableName(table), where: render(where) });
          return selectQueue.shift() ?? [];
        },
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => {
          const call: Call = { kind: 'update', table: tableName(table), set, where: render(where) };
          calls.push(call);
          const result = Promise.resolve(updateQueue.shift() ?? []);
          return Object.assign(result, { returning: () => result });
        },
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: async (values: unknown) => {
        calls.push({ kind: 'insert', table: tableName(table), values });
      },
    })),
  };
  return { executor: executor as unknown as CreditExecutor, calls };
}

const setSql = (set: Record<string, unknown> | undefined, key: string) => render(set?.[key] as SQL);

const A = { id: 'a', label: null, allowedClassTypes: ['yoga'], windowStart: null, windowEnd: null, creditsRemaining: 1, creditsTotal: 1, sortOrder: 0 };
const B = { id: 'b', label: null, allowedClassTypes: ['mat_pilates', 'barre'], windowStart: null, windowEnd: null, creditsRemaining: 1, creditsTotal: 1, sortOrder: 1 };
const special = { userSubscriptionId: 'us-1', kind: 'special' as const, isOpenLab: false, packageName: 'Reset Pass' };

describe('consumeClassCredit', () => {
  it('especial: bloquea la suscripción ANTES de leer los grupos y descuenta grupo y total con guardas', async () => {
    const { executor, calls } = fakeExecutor({ selectRows: [[A, B]], updateRows: [[{ id: 'b' }], [{ id: 'us-1' }]] });

    const balanceId = await consumeClassCredit(executor, special, { classType: 'barre', classDate: at('09:00') });

    expect(balanceId).toBe('b');
    expect(calls.map((c) => `${c.kind}:${c.table ?? ''}`)).toEqual([
      'execute:',
      'select:user_subscription_balances',
      'update:user_subscription_balances',
      'update:user_suscriptions',
    ]);
    expect(calls[0].where).toMatch(/FROM user_suscriptions WHERE id = \$1 FOR UPDATE/);
    expect(setSql(calls[2].set, 'creditsRemaining')).toBe('credits_remaining - 1');
    expect(calls[2].where).toMatch(/"credits_remaining" > \$\d/);
    expect(setSql(calls[3].set, 'daysRemaining')).toBe('days_remaining - 1');
    expect(calls[3].where).toMatch(/"days_remaining" > \$\d/);
  });

  it('especial sin grupo utilizable: lanza el motivo exacto y no escribe', async () => {
    const { executor, calls } = fakeExecutor({ selectRows: [[A, { ...B, creditsRemaining: 0 }]] });

    await expect(consumeClassCredit(executor, special, { classType: 'barre', classDate: at('09:00') })).rejects.toMatchObject({
      rejection: { code: 'GROUP_EXHAUSTED' },
    });
    expect(calls.filter((c) => c.kind === 'update')).toHaveLength(0);
  });

  it('especial: si la guarda del grupo no afecta filas (carrera perdida), lanza y no toca el total', async () => {
    const { executor, calls } = fakeExecutor({ selectRows: [[A, B]], updateRows: [[]] });

    const error = await consumeClassCredit(executor, special, { classType: 'mat_pilates', classDate: at('09:00') }).catch((e) => e);

    expect(error).toBeInstanceOf(BookingRejectionError);
    expect(calls.filter((c) => c.table === 'user_suscriptions' && c.kind === 'update')).toHaveLength(0);
  });

  it('especial: si la guarda del total no afecta filas, lanza NO_CREDITS', async () => {
    const { executor } = fakeExecutor({ selectRows: [[A, B]], updateRows: [[{ id: 'b' }], []] });
    await expect(consumeClassCredit(executor, special, { classType: 'yoga', classDate: at('09:00') })).rejects.toMatchObject({
      rejection: { code: 'NO_CREDITS' },
    });
  });

  it('Open Lab no escribe nada; estándar solo descuenta days_remaining con guarda (SQL de siempre)', async () => {
    const openLab = fakeExecutor();
    expect(await consumeClassCredit(openLab.executor, { ...special, kind: 'standard', isOpenLab: true }, { classType: 'yoga', classDate: at('09:00') })).toBeNull();
    expect(openLab.calls).toHaveLength(0);

    const standard = fakeExecutor();
    expect(await consumeClassCredit(standard.executor, { ...special, kind: 'standard' }, { classType: 'yoga', classDate: at('09:00') })).toBeNull();
    expect(standard.calls).toHaveLength(1);
    expect(standard.calls[0].where).toMatch(/SET days_remaining = days_remaining - 1\s+WHERE id = \$1 AND days_remaining > 0/);
  });
});

describe('restoreEnrollmentCredit', () => {
  it('con grupo: +1 al grupo (sin pasar del total) y +1 al total', async () => {
    const { executor, calls } = fakeExecutor({ updateRows: [[{ id: 'b' }]] });

    const outcome = await restoreEnrollmentCredit(executor, { userSubscriptionId: 'us-1', balanceId: 'b', isOpenLab: false, subscriptionActive: true });

    expect(outcome).toBe('restored');
    expect(setSql(calls[0].set, 'creditsRemaining')).toBe('credits_remaining + 1');
    expect(calls[0].where).toMatch(/"credits_remaining" < "user_subscription_balances"."credits_total"/);
    expect(calls[1].where).toMatch(/SET days_remaining = days_remaining \+ 1\s+WHERE id = \$1/);
  });

  it('con el grupo ya lleno no toca el total (INV-1)', async () => {
    const { executor, calls } = fakeExecutor({ updateRows: [[]] });
    await restoreEnrollmentCredit(executor, { userSubscriptionId: 'us-1', balanceId: 'b', isOpenLab: false, subscriptionActive: true });
    expect(calls).toHaveLength(1);
  });

  it('sin grupo: el +1 de siempre; en Open Lab nada (H14)', async () => {
    const legacy = fakeExecutor();
    expect(await restoreEnrollmentCredit(legacy.executor, { userSubscriptionId: 'us-1', balanceId: null, isOpenLab: false, subscriptionActive: true })).toBe('restored');
    expect(legacy.calls[0].where).toMatch(/SET days_remaining = days_remaining \+ 1\s+WHERE id = \$1/);

    const openLab = fakeExecutor();
    expect(await restoreEnrollmentCredit(openLab.executor, { userSubscriptionId: 'us-1', balanceId: null, isOpenLab: true, subscriptionActive: true })).toBe('no_credit_tracking');
    expect(openLab.calls).toHaveLength(0);
  });

  it('S1: con la suscripción ya no vigente no reintegra nada', async () => {
    const { executor, calls } = fakeExecutor();
    expect(await restoreEnrollmentCredit(executor, { userSubscriptionId: 'us-1', balanceId: 'b', isOpenLab: false, subscriptionActive: false })).toBe('subscription_inactive');
    expect(calls).toHaveLength(0);
  });
});

describe('copia al comprar y activación', () => {
  it('buildSubscriptionSnapshot copia precio, vigencia (30 si NULL) y pases', () => {
    expect(buildSubscriptionSnapshot({ price: 179, validityDays: 14, guestCredits: 2 })).toEqual({ priceSnapshot: 179, validityDaysSnapshot: 14, guestCreditsSnapshot: 2 });
    expect(buildSubscriptionSnapshot({ price: 360, validityDays: null, guestCredits: 0 })).toEqual({ priceSnapshot: 360, validityDaysSnapshot: 30, guestCreditsSnapshot: 0 });
  });

  it('balanceRowsFromRules: un balance por regla, en 0 hasta confirmar el pago, con etiqueta derivada', () => {
    const rows = balanceRowsFromRules('us-1', [
      { id: 'r1', label: null, credits: 1, allowedClassTypes: ['mat_pilates', 'barre'], windowStart: '07:00:00', windowEnd: '11:00:00', sortOrder: 1 },
    ]);
    expect(rows).toEqual([
      { userSubscriptionId: 'us-1', ruleId: 'r1', label: 'Mat Pilates / Barre', allowedClassTypes: ['mat_pilates', 'barre'], windowStart: '07:00:00', windowEnd: '11:00:00', creditsTotal: 1, creditsRemaining: 0, sortOrder: 1 },
    ]);
  });

  it('activateBalances llena cada grupo a su total', async () => {
    const { executor, calls } = fakeExecutor();
    await activateBalances(executor, 'us-1');
    expect(calls[0].table).toBe('user_subscription_balances');
    expect(render(calls[0].set?.creditsRemaining as SQL)).toBe('"user_subscription_balances"."credits_total"');
  });
});

describe('expireOtherActiveSubscriptions (D2)', () => {
  it('vence las demás activas del usuario, sin créditos, y vacía sus grupos', async () => {
    const { executor, calls } = fakeExecutor({ updateRows: [[{ id: 'old' }]] });

    const expired = await expireOtherActiveSubscriptions(executor, 'user-1', 'new');

    expect(expired).toEqual(['old']);
    expect(calls[0].set).toMatchObject({ active: false, status: 'expired', daysRemaining: 0 });
    expect(calls[0].where).toMatch(/"user_id" = \$1 and "user_suscriptions"."active" = \$2 and "user_suscriptions"."id" <> \$3/);
    expect(calls[1]).toMatchObject({ kind: 'update', table: 'user_subscription_balances', set: { creditsRemaining: 0 } });
  });

  it('sin otras activas no toca los grupos', async () => {
    const { executor, calls } = fakeExecutor({ updateRows: [[]] });
    expect(await expireOtherActiveSubscriptions(executor, 'user-1', 'new')).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('adjustCreditManually (D5)', () => {
  it('rechaza un grupo ajeno a la suscripción', async () => {
    const { executor, calls } = fakeExecutor({ selectRows: [[]] });
    expect(await adjustCreditManually(executor, { userSubscriptionId: 'us-1', balanceId: 'otro', delta: 1 })).toEqual({
      ok: false,
      error: 'Ese grupo no pertenece a la suscripción.',
    });
    expect(calls.filter((c) => c.kind === 'update')).toHaveLength(0);
  });

  it('+1 a un grupo lleno → error; −1 a un grupo vacío → error', async () => {
    const full = fakeExecutor({ selectRows: [[{ ...B, creditsRemaining: 1 }]] });
    expect(await adjustCreditManually(full.executor, { userSubscriptionId: 'us-1', balanceId: 'b', delta: 1 })).toEqual({ ok: false, error: 'Ese grupo ya tiene todos sus créditos.' });
    const empty = fakeExecutor({ selectRows: [[{ ...B, creditsRemaining: 0 }]] });
    expect(await adjustCreditManually(empty.executor, { userSubscriptionId: 'us-1', balanceId: 'b', delta: -1 })).toEqual({ ok: false, error: 'Ese grupo ya no tiene créditos.' });
  });

  it('−1 ajusta grupo y total juntos y devuelve el total restante', async () => {
    const { executor, calls } = fakeExecutor({ selectRows: [[B]], updateRows: [[{ id: 'b' }], [{ daysRemaining: 1 }]] });
    expect(await adjustCreditManually(executor, { userSubscriptionId: 'us-1', balanceId: 'b', delta: -1 })).toEqual({ ok: true, daysRemaining: 1 });
    expect(setSql(calls[1].set, 'creditsRemaining')).toBe('credits_remaining - 1');
    expect(setSql(calls[2].set, 'daysRemaining')).toBe('days_remaining - 1');
  });
});

describe('INV-1 (propiedad sobre un modelo en memoria)', () => {
  it('cualquier secuencia de consumos y reintegros mantiene days_remaining = Σ credits_remaining y 0 ≤ saldo ≤ total', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(fc.boolean(), fc.constantFrom('yoga', 'barre', 'mat_pilates', 'sculpt')), { maxLength: 15 }), async (ops) => {
        const groups = [{ ...A, creditsRemaining: 1 }, { ...B, creditsTotal: 2, creditsRemaining: 2 }];
        let daysRemaining = 3;
        const consumed: string[] = [];
        for (const [isConsume, classType] of ops) {
          if (isConsume) {
            const { executor } = fakeExecutor({ selectRows: [groups.map((g) => ({ ...g }))], updateRows: [[{}], [{}]] });
            const id = await consumeClassCredit(executor, special, { classType, classDate: at('09:00') }).catch(() => null);
            if (id) {
              const group = groups.find((g) => g.id === id)!;
              group.creditsRemaining -= 1;
              daysRemaining -= 1;
              consumed.push(id);
            }
          } else if (consumed.length > 0) {
            const id = consumed.pop()!;
            const group = groups.find((g) => g.id === id)!;
            if (group.creditsRemaining < group.creditsTotal) {
              group.creditsRemaining += 1;
              daysRemaining += 1;
            }
          }
          expect(daysRemaining).toBe(groups.reduce((sum, g) => sum + g.creditsRemaining, 0));
          for (const g of groups) {
            expect(g.creditsRemaining).toBeGreaterThanOrEqual(0);
            expect(g.creditsRemaining).toBeLessThanOrEqual(g.creditsTotal);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
