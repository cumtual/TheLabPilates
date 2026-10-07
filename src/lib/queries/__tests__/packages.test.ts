// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/** Lecturas del catálogo (SPEC-SPECIAL-PACKAGES §4.4). */

vi.mock('@/db', () => ({ db: { select: vi.fn(), query: { subscriptions: { findMany: vi.fn() } } } }));

import { getAdminPackages, getPublicPackages } from '../packages';
import { AdminAuditForbiddenError } from '../admin-enrollment-audit';
import { db } from '@/db';

const dialect = new PgDialect();
const render = (value: unknown) => dialect.sqlToQuery(value as SQL).sql;

const row = {
  id: 'p1', name: 'Reset Pass', kind: 'special', guest: false, sessions: 2, price: 179, validityDays: 14, guestCredits: 0,
  shortDescription: 'Un respiro.', features: [], isFeatured: false, isActive: true, displayOrder: 6,
  rules: [{ label: null, credits: 1, allowedClassTypes: ['yoga'], windowStart: '07:00:00', windowEnd: '11:00:00', sortOrder: 0 }],
};

beforeEach(() => vi.clearAllMocks());

describe('getPublicPackages', () => {
  it('filtra activos y no eliminados, y ordena por display_order y precio', async () => {
    vi.mocked(db.query.subscriptions.findMany).mockResolvedValue([row] as never);

    const packages = await getPublicPackages();

    const args = vi.mocked(db.query.subscriptions.findMany).mock.calls[0][0] as { where: SQL; orderBy: SQL[] };
    expect(render(args.where)).toBe('("suscriptions"."is_active" = $1 and "suscriptions"."deleted_at" is null)');
    expect(args.orderBy.map(render)).toEqual(['"suscriptions"."display_order" asc', '"suscriptions"."price" asc']);
    expect(packages[0]).toMatchObject({ id: 'p1', sessionsLabel: '1 YOGA', validityLabel: 'Vigencia: 2 semanas' });
  });
});

describe('getAdminPackages', () => {
  it('exige admin antes de tocar la BD', async () => {
    await expect(getAdminPackages({ role: 'coach' })).rejects.toBeInstanceOf(AdminAuditForbiddenError);
    expect(db.query.subscriptions.findMany).not.toHaveBeenCalled();
  });

  it('incluye eliminados fuera, ventas y reglas con franja en HH:MM', async () => {
    vi.mocked(db.query.subscriptions.findMany).mockResolvedValue([row] as never);
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: () => ({ groupBy: async () => [{ subscriptionId: 'p1', total: 3 }] }) }) } as never);

    const [pkg] = await getAdminPackages({ role: 'admin' });

    const args = vi.mocked(db.query.subscriptions.findMany).mock.calls[0][0] as { where: SQL };
    expect(render(args.where)).toBe('"suscriptions"."deleted_at" is null');
    expect(pkg).toMatchObject({ salesCount: 3, validityDays: 14, isActive: true, rules: [{ credits: 1, allowedClassTypes: ['yoga'], timeWindow: { start: '07:00', end: '11:00' } }] });
  });
});
