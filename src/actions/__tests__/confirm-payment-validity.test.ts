// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/** Expiración dinámica y una sola suscripción activa (SPEC-SPECIAL-PACKAGES §6.2, D2, D3, S3). */

vi.mock('@/db', () => ({
  db: {
    update: vi.fn(),
    transaction: vi.fn(),
    query: { payments: { findFirst: vi.fn() }, userSubscriptions: { findFirst: vi.fn() }, subscriptions: { findFirst: vi.fn() } },
  },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/email/service', () => ({ sendClassCancellationEmail: vi.fn(), sendPaymentRejectedEmail: vi.fn() }));

import { confirmPaymentAction, reactivateSubscriptionAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

const dialect = new PgDialect();
const render = (value: unknown) => dialect.sqlToQuery(value as SQL);
const nameOf = (table: unknown) => (table as Record<symbol, string>)[Symbol.for('drizzle:Name')];

type Op = { kind: 'update' | 'execute'; table?: string; set?: Record<string, unknown>; sql?: string; params?: unknown[] };

function setup(opts: { kind: 'standard' | 'special'; otherActive?: string[]; failOn?: 'expire' }) {
  vi.mocked(getSession).mockResolvedValue({ sub: 'admin-1', role: 'admin', email: 'a@test.com' } as never);
  vi.mocked(db.query.payments.findFirst).mockResolvedValue({ id: 'pay-1', confirmed: false } as never);
  vi.mocked(db.query.userSubscriptions.findFirst).mockResolvedValue({ id: 'us-new', userId: 'user-1', subscriptionId: 'pkg', paymentId: 'pay-1' } as never);
  vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({ id: 'pkg', sessions: 2, guest: false, kind: opts.kind } as never);

  const committed: Op[] = [];
  vi.mocked(db.transaction).mockImplementation((async (cb: (tx: unknown) => Promise<unknown>) => {
    const pending: Op[] = [];
    const tx = {
      execute: async (query: SQL) => {
        const { sql, params } = render(query);
        pending.push({ kind: 'execute', sql, params });
      },
      update: (table: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: () => {
            const op: Op = { kind: 'update', table: nameOf(table), set };
            const isExpire = op.table === 'user_suscriptions' && set.status === 'expired';
            if (isExpire && opts.failOn === 'expire') throw new Error('boom');
            pending.push(op);
            const rows = isExpire ? (opts.otherActive ?? []).map((id) => ({ id })) : [];
            return Object.assign(Promise.resolve(rows), { returning: async () => rows });
          },
        }),
      }),
    };
    await cb(tx);
    committed.push(...pending); // COMMIT solo si no hubo error
  }) as never);
  return committed;
}

beforeEach(() => vi.clearAllMocks());

describe('confirmPaymentAction', () => {
  it('D3: la expiración usa la vigencia copiada al comprar (30 si es una suscripción anterior)', async () => {
    const ops = setup({ kind: 'standard' });

    expect((await confirmPaymentAction('pay-1')).success).toBe(true);

    const grant = ops.find((o) => o.kind === 'execute')!;
    expect(grant.sql).toMatch(/SET days_remaining = days_remaining \+ \$1,\s+expiration_date = NOW\(\) \+ make_interval\(days => COALESCE\(validity_days_snapshot, \$2\)\)\s+WHERE payment_id = \$3/);
    expect(grant.params).toEqual([2, 30, 'pay-1']);
  });

  it('un especial llena sus grupos en la misma transacción', async () => {
    const ops = setup({ kind: 'special' });
    await confirmPaymentAction('pay-1');
    const fill = ops.find((o) => o.table === 'user_subscription_balances')!;
    expect(render(fill.set?.creditsRemaining).sql).toBe('"user_subscription_balances"."credits_total"');
  });

  it('D2 + S3: la suscripción activa anterior vence al confirmar y se avisa al admin', async () => {
    const ops = setup({ kind: 'standard', otherActive: ['us-old'] });

    const result = await confirmPaymentAction('pay-1');

    expect(result).toEqual({ success: true, message: 'Pago confirmado exitosamente. La suscripción anterior del cliente quedó vencida.' });
    expect(ops.find((o) => o.set?.status === 'expired')?.set).toMatchObject({ active: false, status: 'expired', daysRemaining: 0 });
    expect(ops.find((o) => o.table === 'user_subscription_balances')?.set).toEqual({ creditsRemaining: 0 });
    expect(ops.find((o) => o.table === 'user_suscriptions' && o.set?.active === true)).toBeDefined();
  });

  it('si la transacción falla, no se confirma nada y la anterior sigue activa', async () => {
    const ops = setup({ kind: 'standard', otherActive: ['us-old'], failOn: 'expire' });

    await expect(confirmPaymentAction('pay-1')).rejects.toThrow('boom');
    expect(ops).toHaveLength(0);
  });
});

describe('reactivateSubscriptionAction', () => {
  it('extiende la vigencia con los días copiados al comprar', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T10:00:00.000-06:00'));
    vi.mocked(getSession).mockResolvedValue({ sub: 'admin-1', role: 'admin', email: 'a@test.com' } as never);
    vi.mocked(db.query.userSubscriptions.findFirst)
      .mockResolvedValueOnce({ id: 'us-1', userId: 'user-1', active: false, validityDaysSnapshot: 14 } as never)
      .mockResolvedValueOnce(undefined as never);
    let set: Record<string, unknown> | undefined;
    vi.mocked(db.update).mockReturnValue({ set: (s: Record<string, unknown>) => ((set = s), { where: async () => undefined }) } as never);

    expect((await reactivateSubscriptionAction('us-1')).success).toBe(true);
    expect(set?.expirationDate).toEqual(new Date('2026-10-21T10:00:00.000-06:00'));
    vi.useRealTimers();
  });
});
