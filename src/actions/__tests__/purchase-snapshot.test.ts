// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Compra con copia de condiciones (SPEC-SPECIAL-PACKAGES §6.1, D4, H9, S3). */

vi.mock('@/db', () => ({
  db: {
    query: { userSubscriptions: { findMany: vi.fn() }, payments: { findFirst: vi.fn() }, subscriptions: { findFirst: vi.fn() } },
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));

import { purchaseSubscriptionAction } from '../subscription';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

const nameOf = (table: unknown) => (table as Record<symbol, string>)[Symbol.for('drizzle:Name')];

const resetPass = {
  id: 'pkg-reset',
  name: 'Reset Pass',
  kind: 'special',
  isActive: true,
  deletedAt: null,
  price: 179,
  validityDays: 14,
  guestCredits: 2,
  rules: [
    { id: 'r2', label: null, credits: 1, allowedClassTypes: ['mat_pilates', 'barre'], windowStart: null, windowEnd: null, sortOrder: 1 },
    { id: 'r1', label: null, credits: 1, allowedClassTypes: ['yoga'], windowStart: '07:00:00', windowEnd: '11:00:00', sortOrder: 0 },
  ],
};

let inserts: { table: string; values: unknown }[];
let updates: { table: string; set: unknown }[];

beforeEach(() => {
  vi.clearAllMocks();
  inserts = [];
  updates = [];
  vi.mocked(getSession).mockResolvedValue({ sub: 'user-1', role: 'client', email: 'c@test.com' } as never);
  vi.mocked(db.query.userSubscriptions.findMany).mockResolvedValue([]);
  vi.mocked(db.update).mockImplementation(((table: unknown) => ({
    set: (set: unknown) => ({ where: async () => { updates.push({ table: nameOf(table), set }); } }),
  })) as never);
  const tx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table: nameOf(table), values });
        const rows = nameOf(table) === 'payments' ? [{ id: 'pay-1' }] : [{ id: 'us-new' }];
        return Object.assign(Promise.resolve(), { returning: async () => rows });
      },
    }),
  };
  vi.mocked(db.transaction).mockImplementation((async (cb: (t: unknown) => unknown) => cb(tx)) as never);
});

describe('purchaseSubscriptionAction', () => {
  it.each([
    ['no existe', undefined],
    ['está inactivo', { ...resetPass, isActive: false }],
    ['está eliminado', { ...resetPass, deletedAt: new Date() }],
  ])('rechaza un paquete que %s y no inserta nada', async (_label, pkg) => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue(pkg as never);

    expect(await purchaseSubscriptionAction('pkg-reset', 'transfer')).toEqual({ success: false, error: 'Este paquete ya no está disponible.' });
    expect(inserts).toHaveLength(0);
  });

  it('copia precio, vigencia y pases, y crea los grupos en 0 en la misma transacción', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue(resetPass as never);

    expect((await purchaseSubscriptionAction('pkg-reset', 'transfer')).success).toBe(true);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(inserts.map((i) => i.table)).toEqual(['payments', 'user_suscriptions', 'user_subscription_balances']);
    expect(inserts[1].values).toMatchObject({
      subscriptionId: 'pkg-reset',
      active: false,
      priceSnapshot: 179,
      validityDaysSnapshot: 14,
      guestCreditsSnapshot: 2,
    });
    expect(inserts[2].values).toEqual([
      expect.objectContaining({ userSubscriptionId: 'us-new', ruleId: 'r1', label: 'Yoga', creditsTotal: 1, creditsRemaining: 0, windowStart: '07:00:00' }),
      expect.objectContaining({ ruleId: 'r2', label: 'Mat Pilates / Barre', creditsRemaining: 0 }),
    ]);
  });

  it('un paquete estándar sin vigencia propia copia 30 días y no crea grupos', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({ ...resetPass, kind: 'standard', validityDays: null, guestCredits: 0, rules: [] } as never);

    await purchaseSubscriptionAction('pkg-reset', 'cash');

    expect(inserts.map((i) => i.table)).toEqual(['payments', 'user_suscriptions']);
    expect(inserts[1].values).toMatchObject({ validityDaysSnapshot: 30, guestCreditsSnapshot: 0 });
  });

  it('S3: no toca la suscripción activa (solo expira las suspendidas, como antes)', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue(resetPass as never);

    await purchaseSubscriptionAction('pkg-reset', 'transfer');

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ table: 'user_suscriptions', set: { status: 'expired' } });
  });
});
