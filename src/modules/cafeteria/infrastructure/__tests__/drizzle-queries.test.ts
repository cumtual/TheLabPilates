// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import {
  advisoryLock,
  countMonthlyUsedQuery,
  courtesyLockKey,
  escapeLike,
  grantRedeemedSql,
  listGrantsQuery,
  listOpenOrdersQuery,
  markClosedQuery,
  resolveClosingQuery,
  revokeGrantQuery,
  searchUsersQuery,
  voidOrderQuery,
} from '../drizzle-queries';

/** SQL de los repositorios (TASK-CF-INF-01). Construye las consultas sin conectarse. */

const db = drizzle(postgres('postgres://test@127.0.0.1:1/none', { prepare: false }), { schema });
const dialect = new PgDialect();
const lower = (q: { sql: string }) => q.sql.toLowerCase();

describe('candados', () => {
  it('cortesía: pg_advisory_xact_lock con la llave del cliente', () => {
    const q = dialect.sqlToQuery(advisoryLock(courtesyLockKey('u1')));
    expect(q.sql).toBe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))');
    expect(q.params).toEqual(['bar-courtesy:u1']);
  });
});

describe('conteos de cortesías', () => {
  it('el cupo mensual une con pedidos paid', () => {
    const q = countMonthlyUsedQuery(db, 'u1', '2026-10').toSQL();
    expect(lower(q)).toContain('inner join "bar_orders"');
    expect(lower(q)).toMatch(/"bar_orders"\."status" = \$1/);
    expect(q.params).toEqual(['paid', 'monthly', 'u1', '2026-10']);
  });

  it('los canjes de un regalo unen con pedidos paid, con columnas calificadas en la consulta real', () => {
    const q = listGrantsQuery(db, { userId: 'u1' }).toSQL().sql.replace(/\s+/g, ' ');
    expect(q).toContain('"redeemed_order"."id" = "redeemed_item"."order_id"');
    expect(q).toContain('"redeemed_item"."courtesy_grant_id" = "cafeteria_courtesy_grants"."id"');
    expect(q).toContain(`"redeemed_order"."status" = 'paid'`);
    expect(q).toContain('"cafeteria_courtesy_grants"."user_id" = $1');
    // Ninguna columna suelta ambigua dentro del subquery.
    const sub = q.slice(q.indexOf('(SELECT count'), q.indexOf(') from'));
    expect(sub).not.toMatch(/(^|[^.])"(id|status|order_id|courtesy_grant_id)"/);
    expect(dialect.sqlToQuery(grantRedeemedSql).params).toEqual([]);
  });
});

describe('guardas de estado en el WHERE', () => {
  it('el corte bloquea con FOR UPDATE solo pagados sin corte', () => {
    const q = lower(listOpenOrdersQuery(db, true).toSQL());
    expect(q).toContain('"bar_orders"."closing_id" is null');
    expect(q).toContain('"bar_orders"."status" = $1');
    expect(q.trim().endsWith('for update')).toBe(true);
    expect(lower(listOpenOrdersQuery(db, false).toSQL())).not.toContain('for update');
  });

  it('marcar cerrados repite la guarda', () => {
    const q = lower(markClosedQuery(db, ['o1'], 'c1').toSQL());
    expect(q).toContain('"closing_id" is null');
    expect(q).toContain('"status" = $');
  });

  it('anular: solo paid y sin corte', () => {
    const q = voidOrderQuery(db, 'o1', { voidedAt: new Date(), voidedBy: 'a', voidReason: 'x' }).toSQL();
    expect(lower(q)).toMatch(/where \("bar_orders"\."id" = \$\d+ and "bar_orders"\."status" = \$\d+ and "bar_orders"\."closing_id" is null\)/);
    expect(q.params).toContain('voided');
    expect(q.params).toContain('paid');
  });

  it('resolver: solo pending; el correo 2 queda pending', () => {
    const q = resolveClosingQuery(db, 'c1', { status: 'approved', resolvedBy: 'a', resolvedAt: new Date(), cashReceivedCents: 1, shortfallCents: 0, resolutionNote: null }).toSQL();
    expect(lower(q)).toMatch(/"bar_cash_closings"\."status" = \$\d+\)/);
    expect(q.params.filter((p) => p === 'pending')).toHaveLength(2);
  });

  it('revocar: solo si no estaba revocado', () => {
    expect(lower(revokeGrantQuery(db, 'g1', { revokedAt: new Date(), revokedBy: 'a', revokeReason: 'x' }).toSQL())).toContain('"revoked_at" is null');
  });
});

describe('búsqueda de usuarios', () => {
  it('ILIKE por nombre o correo, sin eliminados, con comodines escapados y límite', () => {
    const q = searchUsersQuery(db, '50%_a', 8).toSQL();
    expect(lower(q)).toContain('"users"."deleted_at" is null');
    expect(lower(q)).toMatch(/"users"\."username" ilike \$1 or "users"\."email" ilike \$2/);
    expect(q.params).toEqual(['%50\\%\\_a%', '%50\\%\\_a%', 8]);
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });
});

describe('descuento por membresía (D13)', () => {
  it('misma regla de «activa» que el dashboard: activa, pagada, sin vencer, ni vencida ni suspendida; la de mayor %', async () => {
    const { activeBarDiscountQuery } = await import('../drizzle-queries');
    const q = activeBarDiscountQuery(db, 'u1').toSQL();
    const s = q.sql.toLowerCase();
    for (const part of [
      '"user_suscriptions"."user_id" = $',
      '"user_suscriptions"."active" = $',
      '"user_suscriptions"."status" is null or "user_suscriptions"."status" not in ($',
      '"payments"."confirmend" = $',
      '"user_suscriptions"."expiration_date" is null or "user_suscriptions"."expiration_date" > now()',
      '"suscriptions"."bar_discount_percent" > $',
      'order by "suscriptions"."bar_discount_percent" desc',
    ]) {
      expect(s).toContain(part);
    }
    expect(q.params).toEqual(['u1', true, 'expired', 'suspended', true, 0, 1]);
    // Una suscripción antigua con status «pending» pero activa y pagada sí cuenta.
    expect(s).not.toContain('"user_suscriptions"."status" = $');
  });
});
