// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import {
  barCashClosings,
  barOrderItems,
  barOrders,
  cafeteriaCategories,
  cafeteriaCourtesyGrants,
  cafeteriaProducts,
  cafeteriaSettings,
  debitCards,
  userRoleEnum,
} from '@/db/schema';
import { loadManualSql } from './sql-test-utils';

/** El esquema Drizzle es espejo del DDL manual (SPEC-CAFETERIA §3.1, TASK-CF-DB-03). */

const ddl = loadManualSql('2026-10-15_001_cafeteria.sql');
/** Columnas que agregan scripts posteriores con `ALTER TABLE … ADD COLUMN` (p. ej. el descuento D13). */
const later = loadManualSql('2026-10-18_001_bar_member_discount.sql');
function addedLater(table: string): Map<string, string> {
  const columns = new Map<string, string>();
  const pattern = new RegExp(`alter table public\\.${table} add column if not exists ([a-z_]+) ([^;]+);`, 'g');
  for (const match of later.matchAll(pattern)) columns.set(match[1], match[2]);
  return columns;
}

const tables = [
  cafeteriaCategories,
  cafeteriaProducts,
  cafeteriaSettings,
  barCashClosings,
  barOrders,
  cafeteriaCourtesyGrants,
  barOrderItems,
];

/**
 * Columnas del `CREATE TABLE` de una tabla: nombre → definición. Separa por las comas
 * seguidas de un identificador y un espacio (las comas de los `IN ('a', 'b')` van seguidas de comilla).
 */
function sqlColumns(table: string): Map<string, string> {
  const head = `create table if not exists public.${table} (`;
  const start = ddl.indexOf(head);
  expect(start, `CREATE TABLE ${table}`).toBeGreaterThanOrEqual(0);
  const body = ddl.slice(start + head.length, ddl.indexOf(');', start));
  const columns = new Map<string, string>();
  for (const part of body.split(/, (?=[a-z_]+ )/)) {
    const [name, ...rest] = part.trim().split(' ');
    if (name !== 'constraint') columns.set(name, rest.join(' '));
  }
  return columns;
}

describe('schema — cafetería', () => {
  it('userRoleEnum incluye barra (script 002)', () => {
    expect(userRoleEnum.enumValues).toEqual(['client', 'coach', 'admin', 'barra']);
  });

  it('debit_cards.bar_active: NOT NULL, default false', () => {
    expect(getTableColumns(debitCards).barActive).toMatchObject({ name: 'bar_active', notNull: true, default: false });
    expect(ddl).toContain('add column if not exists bar_active boolean not null default false');
  });

  it('esquema y CREATE TABLE tienen las mismas columnas con la misma nulabilidad', () => {
    for (const table of tables) {
      const name = getTableName(table);
      const sql = new Map([...sqlColumns(name), ...addedLater(name)]);
      const schema = Object.values(getTableColumns(table));
      expect(schema.map((c) => c.name).sort(), name).toEqual([...sql.keys()].sort());
      for (const column of schema) {
        // Una columna identity es NOT NULL implícitamente en Postgres.
        const sqlNotNull = /not null|primary key|generated always as identity/.test(sql.get(column.name)!);
        expect(column.notNull, `${name}.${column.name} notNull`).toBe(sqlNotNull);
      }
    }
  });

  it('dinero en centavos y defaults de la configuración', () => {
    expect(getTableColumns(cafeteriaProducts).priceCents).toMatchObject({ name: 'price_cents', notNull: true, columnType: 'PgInteger' });
    expect(getTableColumns(barOrderItems).unitPriceCents).toMatchObject({ name: 'unit_price_cents', columnType: 'PgInteger' });
    expect(getTableColumns(barOrderItems).lineTotalCents).toMatchObject({ name: 'line_total_cents', columnType: 'PgInteger' });
    const settings = getTableColumns(cafeteriaSettings);
    expect(settings.coachMonthlyCourtesy).toMatchObject({ notNull: true, default: 4 });
    expect(settings.closingNotifyEmails).toMatchObject({ name: 'closing_notify_emails', notNull: true, hasDefault: true, columnType: 'PgArray' });
  });

  it('las columnas nullable de herencia y temperatura no tienen default', () => {
    for (const column of [
      getTableColumns(cafeteriaCategories).parentId,
      getTableColumns(cafeteriaCategories).courtesyEligible,
      getTableColumns(cafeteriaProducts).temperature,
      getTableColumns(cafeteriaProducts).courtesyOverride,
      getTableColumns(barOrderItems).temperature,
      getTableColumns(barOrderItems).parentCategoryName,
      getTableColumns(cafeteriaCourtesyGrants).expiresAt,
    ]) {
      expect(column.notNull).toBe(false);
      expect(column.hasDefault).toBe(false);
    }
  });

  it('bar_orders: folio identity (solo lectura) y request_id único', () => {
    const c = getTableColumns(barOrders);
    expect(c.folio).toMatchObject({ name: 'folio', notNull: true, generatedIdentity: { type: 'always' } });
    expect(c.requestId).toMatchObject({ name: 'request_id', notNull: true, isUnique: true });
    expect(c.status).toMatchObject({ notNull: true, default: 'paid' });
  });

  it('estados por defecto del corte y de los correos', () => {
    const c = getTableColumns(barCashClosings);
    expect(c.status).toMatchObject({ notNull: true, default: 'pending' });
    expect(c.createdEmailStatus).toMatchObject({ notNull: true, default: 'pending' });
    expect(c.resolvedEmailStatus).toMatchObject({ notNull: false, hasDefault: false });
  });
});
