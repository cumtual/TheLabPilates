// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Ajustes manuales de crédito por grupo (SPEC-SPECIAL-PACKAGES §5.6, D5). */

vi.mock('@/db', () => ({
  db: {
    execute: vi.fn(),
    transaction: vi.fn(),
    query: { userSubscriptions: { findFirst: vi.fn() }, subscriptions: { findFirst: vi.fn() } },
  },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/email/service', () => ({ sendClassCancellationEmail: vi.fn(), sendPaymentRejectedEmail: vi.fn() }));
vi.mock('@/lib/subscription/credits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/subscription/credits')>()),
  adjustCreditManually: vi.fn(),
}));

import { decrementSubscriptionCreditAction, refundSessionCreditAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { adjustCreditManually } from '@/lib/subscription/credits';

const sub = { id: 'us-1', userId: 'user-1', subscriptionId: 'pkg', active: true, status: 'active', daysRemaining: 2 };
const nameOf = (table: unknown) => (table as Record<symbol, string>)[Symbol.for('drizzle:Name')];
let txUpdates: { table: string; set: unknown }[];

beforeEach(() => {
  vi.clearAllMocks();
  txUpdates = [];
  vi.mocked(getSession).mockResolvedValue({ sub: 'admin-1', role: 'admin', email: 'a@test.com' } as never);
  vi.mocked(db.query.userSubscriptions.findFirst).mockResolvedValue(sub as never);
  vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({ id: 'pkg', guest: false, kind: 'special' } as never);
  vi.mocked(db.transaction).mockImplementation((async (cb: (tx: unknown) => unknown) =>
    cb({
      update: (table: unknown) => ({
        set: (set: unknown) => ({ where: async () => { txUpdates.push({ table: nameOf(table), set }); } }),
      }),
    })) as never);
});

describe('refundSessionCreditAction (+1)', () => {
  it('en un especial sin grupo pide elegirlo y no escribe', async () => {
    expect(await refundSessionCreditAction('user-1')).toEqual({ success: false, error: 'Selecciona el grupo de créditos.', field: 'balanceId' });
    expect(adjustCreditManually).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('con grupo: ajusta grupo y total juntos', async () => {
    vi.mocked(adjustCreditManually).mockResolvedValue({ ok: true, daysRemaining: 3 });
    expect(await refundSessionCreditAction('user-1', 'B')).toEqual({ success: true, message: 'Crédito de sesión otorgado.' });
    expect(adjustCreditManually).toHaveBeenCalledWith(expect.anything(), { userSubscriptionId: 'us-1', balanceId: 'B', delta: 1 });
  });

  it('grupo lleno o ajeno → error del módulo de créditos', async () => {
    vi.mocked(adjustCreditManually).mockResolvedValue({ ok: false, error: 'Ese grupo ya tiene todos sus créditos.' });
    expect(await refundSessionCreditAction('user-1', 'B')).toEqual({ success: false, error: 'Ese grupo ya tiene todos sus créditos.', field: 'balanceId' });
  });

  it('estándar: el +1 de siempre, sin grupo', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({ id: 'pkg', guest: false, kind: 'standard' } as never);
    expect((await refundSessionCreditAction('user-1')).success).toBe(true);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(adjustCreditManually).not.toHaveBeenCalled();
  });
});

describe('decrementSubscriptionCreditAction (−1)', () => {
  it('en un especial sin grupo pide elegirlo', async () => {
    expect(await decrementSubscriptionCreditAction('us-1')).toEqual({ success: false, error: 'Selecciona el grupo de créditos.', field: 'balanceId' });
  });

  it('descuenta del grupo elegido y reporta el total restante', async () => {
    vi.mocked(adjustCreditManually).mockResolvedValue({ ok: true, daysRemaining: 1 });
    expect(await decrementSubscriptionCreditAction('us-1', 'A')).toMatchObject({ success: true, data: { daysRemaining: 1, expired: false } });
    expect(adjustCreditManually).toHaveBeenCalledWith(expect.anything(), { userSubscriptionId: 'us-1', balanceId: 'A', delta: -1 });
    expect(txUpdates).toHaveLength(0);
  });

  it('al llegar a 0 en total, la suscripción vence (nunca se suspende)', async () => {
    vi.mocked(adjustCreditManually).mockResolvedValue({ ok: true, daysRemaining: 0 });
    expect(await decrementSubscriptionCreditAction('us-1', 'A')).toMatchObject({ success: true, data: { expired: true } });
    expect(txUpdates).toEqual([{ table: 'user_suscriptions', set: expect.objectContaining({ active: false, status: 'expired' }) }]);
  });

  it('grupo vacío → error', async () => {
    vi.mocked(adjustCreditManually).mockResolvedValue({ ok: false, error: 'Ese grupo ya no tiene créditos.' });
    expect(await decrementSubscriptionCreditAction('us-1', 'A')).toEqual({ success: false, error: 'Ese grupo ya no tiene créditos.' });
  });
});
