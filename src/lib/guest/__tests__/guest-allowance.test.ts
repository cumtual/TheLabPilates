// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/** Pases de invitado (SPEC-SPECIAL-PACKAGES §5.7, D6, H10). */

vi.mock('@/db', () => ({ db: { select: vi.fn(), delete: vi.fn(), query: { guestCredits: { findFirst: vi.fn() } } } }));

import { consumeGuestCreditInTx, getGuestCreditsForCycle, guestCreditsTotalFor, restoreGuestCredit } from '../credits';
import { db } from '@/db';

const dialect = new PgDialect();
const render = (value: unknown) => dialect.sqlToQuery(value as SQL);

beforeEach(() => vi.clearAllMocks());

describe('guestCreditsTotalFor', () => {
  it('Open Lab: 1; especial: los copiados al comprar; otros: 0', () => {
    expect(guestCreditsTotalFor({ subscription: { guest: true, kind: 'standard' }, userSub: {} })).toBe(1);
    expect(guestCreditsTotalFor({ subscription: { guest: false, kind: 'special' }, userSub: { guestCreditsSnapshot: 2 } })).toBe(2);
    expect(guestCreditsTotalFor({ subscription: { guest: false, kind: 'special' }, userSub: { guestCreditsSnapshot: null } })).toBe(0);
    expect(guestCreditsTotalFor({ subscription: { guest: false, kind: 'standard' }, userSub: { guestCreditsSnapshot: 3 } })).toBe(0);
  });
});

describe('getGuestCreditsForCycle con varios pases', () => {
  it('resta los pases usados al total', async () => {
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [{ creditsUsed: 1 }] }) } as never);
    expect(await getGuestCreditsForCycle('user-1', 'us-1', 2)).toBe(1);
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [{ creditsUsed: 1 }, { creditsUsed: 1 }] }) } as never);
    expect(await getGuestCreditsForCycle('user-1', 'us-1', 2)).toBe(0);
  });
});

describe('consumeGuestCreditInTx con varios pases', () => {
  function tx(usedRows: number) {
    const executed: string[] = [];
    return {
      executed,
      tx: {
        execute: async (query: SQL) => {
          executed.push(render(query).sql);
        },
        select: () => ({ from: () => ({ where: async () => Array.from({ length: usedRows }, () => ({ creditsUsed: 1 })) }) }),
      } as never,
    };
  }

  it('con N=2: el primero y el segundo agregan una fila cada uno, bajo el bloqueo de la suscripción', async () => {
    for (const used of [0, 1]) {
      const { tx: t, executed } = tx(used);
      await consumeGuestCreditInTx(t, { userId: 'user-1', userSubscriptionId: 'us-1', guestEnrollmentId: `g-${used}`, total: 2 });
      expect(executed[0]).toMatch(/FROM user_suscriptions WHERE id = \$1 FOR UPDATE/);
      expect(executed[1]).toMatch(/^INSERT INTO guest_credits/);
    }
  });

  it('el tercero se rechaza', async () => {
    const { tx: t, executed } = tx(2);
    await expect(consumeGuestCreditInTx(t, { userId: 'user-1', userSubscriptionId: 'us-1', guestEnrollmentId: 'g-3', total: 2 })).rejects.toThrow('NO_CREDITS');
    expect(executed.filter((q) => q.startsWith('INSERT'))).toHaveLength(0);
  });
});

describe('restoreGuestCredit', () => {
  it('con el id del invitado borra solo su pase (H10)', async () => {
    let where: unknown;
    vi.mocked(db.delete).mockReturnValue({ where: async (w: unknown) => { where = w; } } as never);

    await restoreGuestCredit('user-1', 'us-1', 'guest-7');

    const { sql, params } = render(where);
    expect(sql).toContain('"guest_credits"."guest_enrollment_id" = $3');
    expect(params).toEqual(['user-1', 'us-1', 'guest-7']);
  });
});
