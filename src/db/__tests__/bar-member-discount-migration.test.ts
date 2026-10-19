// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { barOrders, subscriptions } from '@/db/schema';
import { loadManualSql, statementsOf } from './sql-test-utils';

/** Descuento en la barra por membresía (SPEC-CAFETERIA D13). */
const sql = loadManualSql('2026-10-18_001_bar_member_discount.sql');

describe('2026-10-18_001_bar_member_discount.sql', () => {
  it('aditivo, idempotente y transaccional', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain("set local lock_timeout = '5s'");
    expect(sql.trim().endsWith('commit;')).toBe(true);
    for (const forbidden of ['drop ', 'truncate', 'delete ', 'update ', 'rename', 'set not null', 'alter type']) {
      expect(sql).not.toContain(forbidden);
    }
    for (const statement of statementsOf(sql).filter((s) => s.includes('add column'))) {
      expect(statement).toContain('add column if not exists');
    }
    expect(sql).toContain("if not exists (select 1 from pg_constraint where conname = 'suscriptions_bar_discount_chk')");
    expect(sql).toContain("if not exists (select 1 from pg_constraint where conname = 'bar_orders_discount_chk')");
  });

  it('columnas con defaults que no cambian filas existentes', () => {
    expect(sql).toContain('add column if not exists bar_discount_percent smallint not null default 0');
    expect(sql).toContain('add column if not exists subtotal_cents integer null');
    expect(sql).toContain('add column if not exists discount_cents integer not null default 0');
    expect(sql).toContain('add column if not exists discount_percent smallint not null default 0');
    expect(sql).toContain('add column if not exists discount_label varchar(80) null');
    expect(sql).toContain('check (bar_discount_percent between 0 and 100)');
    expect(sql).toContain('subtotal_cents is null or total_cents = subtotal_cents - discount_cents');
  });

  it('el esquema Drizzle lo refleja', () => {
    expect(getTableColumns(subscriptions).barDiscountPercent).toMatchObject({ name: 'bar_discount_percent', notNull: true, default: 0 });
    const o = getTableColumns(barOrders);
    expect(o.subtotalCents).toMatchObject({ notNull: false, hasDefault: false });
    expect(o.discountCents).toMatchObject({ notNull: true, default: 0 });
    expect(o.discountPercent).toMatchObject({ notNull: true, default: 0 });
    expect(o.discountLabel).toMatchObject({ notNull: false });
  });
});
