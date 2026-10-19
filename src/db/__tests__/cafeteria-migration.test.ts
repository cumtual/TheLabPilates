// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadManualSql, statementsOf } from './sql-test-utils';

/** Guardas estáticas del DDL de la cafetería (SPEC-CAFETERIA §3.1). BD con datos reales. */

const sql = loadManualSql('2026-10-15_001_cafeteria.sql');
const withoutFkActions = sql.replace(/on delete (cascade|set null|restrict)/g, '');
const tableDdl = (name: string) => {
  const start = sql.indexOf(`create table if not exists public.${name} (`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf(');', start));
};

describe('2026-10-15_001_cafeteria.sql', () => {
  it('es transaccional y con lock_timeout', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('set local lock_timeout');
    expect(sql.trim().endsWith('commit;')).toBe(true);
  });

  it('todo es IF NOT EXISTS', () => {
    for (const kind of ['create table', 'create index', 'create unique index', 'add column']) {
      expect(sql.match(new RegExp(`${kind} if not exists`, 'g'))?.length, kind).toBe(sql.match(new RegExp(`${kind} `, 'g'))?.length);
    }
  });

  it('no contiene sentencias destructivas; el único INSERT es la fila de ajustes idempotente', () => {
    for (const pattern of [/\bdrop\b/, /\btruncate\b/, /\bdelete\b/, /\bupdate\b/, /\brename\b/, /\bset not null\b/, /\balter type\b/, /\balter column\b/]) {
      expect(withoutFkActions).not.toMatch(pattern);
    }
    const inserts = statementsOf(sql).filter((st) => st.startsWith('insert'));
    expect(inserts).toEqual(['insert into public.cafeteria_settings (id) values (1) on conflict (id) do nothing']);
  });

  it('crea las 7 tablas en orden de dependencias', () => {
    const order = ['cafeteria_categories', 'cafeteria_products', 'cafeteria_settings', 'bar_cash_closings', 'bar_orders', 'cafeteria_courtesy_grants', 'bar_order_items'];
    const positions = order.map((t) => sql.indexOf(`create table if not exists public.${t} (`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions.indexOf(Math.max(...positions))).toBe(order.length - 1); // items al final (depende de todas)
    expect(sql.indexOf('public.cafeteria_courtesy_grants (')).toBeLessThan(sql.indexOf('public.bar_order_items ('));
  });

  it('D4: el dinero va en centavos enteros', () => {
    expect(tableDdl('cafeteria_products')).toContain('price_cents integer not null check (price_cents between 1 and 1000000)');
    expect(tableDdl('bar_order_items')).toMatch(/unit_price_cents integer not null/);
    expect(tableDdl('bar_orders')).toMatch(/total_cents integer not null/);
    expect(sql).not.toMatch(/\bnumeric\b|\bdecimal\b|\breal\b|double precision/);
  });

  it('D6: correo del corte por defecto y reglas de entrega y resolución', () => {
    expect(tableDdl('cafeteria_settings')).toContain("default array['thelabpilates77@gmail.com']");
    const closings = tableDdl('bar_cash_closings');
    expect(closings).toContain('check (cash_delivered_cents between 0 and cash_total_cents)');
    expect(closings).toContain('check (cash_delivered_cents = cash_total_cents or delivery_note is not null)');
    expect(closings).toContain("status = 'approved' and resolved_by is not null");
    expect(closings).toContain('shortfall_cents = cash_delivered_cents - cash_received_cents and resolution_note is not null');
  });

  it('pedidos: idempotencia, pago, transferencia con cuenta y anulación antes del corte (D8)', () => {
    const orders = tableDdl('bar_orders');
    expect(orders).toContain('request_id uuid not null unique');
    expect(orders).toContain('check ((total_cents = 0) = (payment_method is null))');
    expect(orders).toContain("check (payment_method is distinct from 'transfer' or bank_account_id is not null)");
    expect(orders).toContain('closing_id is null');
  });

  it('D10/A1: categorías de dos niveles, temperatura solo en bebidas y nombres únicos con nulos', () => {
    const categories = tableDdl('cafeteria_categories');
    expect(categories).toContain('parent_id uuid null references public.cafeteria_categories(id)');
    expect(categories).toContain('check (parent_id is null or parent_id <> id)');
    expect(categories).toContain('check (parent_id is null or not uses_temperature)');
    expect(categories).toContain('courtesy_eligible boolean null');
    expect(sql).toContain("(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))");
    expect(tableDdl('cafeteria_products')).toMatch(/temperature varchar\(4\) null check/);
    expect(sql).toContain("(category_id, lower(name), coalesce(temperature, ''))");
    expect(tableDdl('bar_order_items')).toContain('parent_category_name varchar(60) null');
  });

  it('D11: regalos con alcance coherente y una sola fuente de cortesía por línea', () => {
    const grants = tableDdl('cafeteria_courtesy_grants');
    expect(grants).toContain('quantity smallint not null check (quantity between 1 and 50)');
    expect(grants).toContain("(scope = 'any' and category_id is null and product_id is null)");
    expect(grants).toContain('revoked_at is not null and revoked_by is not null and revoke_reason is not null');
    expect(grants).not.toContain('cascade');
    const items = tableDdl('bar_order_items');
    expect(items).toContain("(courtesy_source = 'monthly' and courtesy_period is not null and courtesy_grant_id is null)");
    expect(items).toContain("(courtesy_source = 'grant' and courtesy_grant_id is not null and courtesy_period is null)");
    expect(items).toContain('line_total_cents = unit_price_cents * quantity');
  });

  it('A6: una sola cuenta bancaria de barra, sin tocar la marca de suscripciones', () => {
    expect(sql).toContain('alter table public.debit_cards add column if not exists bar_active boolean not null default false');
    expect(sql).toContain('on public.debit_cards (bar_active) where bar_active and deleted_at is null');
    expect(sql).not.toMatch(/debit_cards[^;]*\bactive\s*=/);
  });
});
