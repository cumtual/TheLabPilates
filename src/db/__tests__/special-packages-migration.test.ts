// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadManualSql } from './sql-test-utils';

/**
 * Guardas estáticas del DDL de paquetes especiales (SPEC-SPECIAL-PACKAGES §3.1).
 * BD con datos reales: solo cambios aditivos e idempotentes.
 */

const sql = loadManualSql('2026-10-07_001_special_packages.sql');
// Las cláusulas de FK `on delete …` no son sentencias DELETE.
const withoutFkActions = sql.replace(/on delete (cascade|set null|restrict)/g, '');

describe('2026-10-07_001_special_packages.sql', () => {
  it('es transaccional y con lock_timeout', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('set local lock_timeout');
    expect(sql.trim().endsWith('commit;')).toBe(true);
  });

  it('no contiene sentencias destructivas ni que reescriban datos', () => {
    for (const pattern of [
      /\bdrop\b/,
      /\btruncate\b/,
      /\bdelete\b/,
      /\bupdate\b/,
      /\binsert\b/,
      /\balter type\b/,
      /\brename\b/,
      /\bset not null\b/,
      /\balter column\b/,
    ]) {
      expect(withoutFkActions).not.toMatch(pattern);
    }
  });

  it('toda columna nueva usa ADD COLUMN IF NOT EXISTS y toda tabla/índice IF NOT EXISTS', () => {
    const addColumns = sql.match(/add column [a-z_]+/g) ?? [];
    expect(addColumns.length).toBeGreaterThan(0);
    expect(sql.match(/add column if not exists/g)?.length).toBe(sql.match(/add column/g)?.length);
    expect(sql.match(/create table if not exists/g)?.length).toBe(sql.match(/create table/g)?.length);
    expect(sql.match(/create index if not exists/g)?.length).toBe(sql.match(/create index/g)?.length);
  });

  it('cada ADD CONSTRAINT está protegido por pg_constraint', () => {
    const constraints = sql.match(/add constraint ([a-z0-9_]+)/g) ?? [];
    expect(constraints).toHaveLength(5);
    for (const constraint of constraints) {
      const name = constraint.replace('add constraint ', '');
      expect(sql).toContain(`where conname = '${name}'`);
    }
  });

  it('impone los límites de la tarjeta y que un especial nunca sea Open Lab', () => {
    expect(sql).toContain('check (cardinality(features) <= 4)');
    expect(sql).toContain('short_description varchar(49)');
    expect(sql).toContain("check (kind <> 'special' or guest is not true)");
    expect(sql).toContain('check (guest_credits between 0 and 10)');
    expect(sql).toContain('check (validity_days is null or validity_days between 1 and 365)');
  });

  it('las columnas nuevas de user_suscriptions y class_enrolleds son NULL y sin DEFAULT', () => {
    for (const column of ['price_snapshot', 'validity_days_snapshot', 'guest_credits_snapshot', 'balance_id']) {
      const definition = sql.match(new RegExp(`add column if not exists ${column} [^;]*`))?.[0] ?? '';
      expect(definition).toContain('null');
      expect(definition).not.toContain('not null');
      expect(definition).not.toContain('default');
    }
  });

  it('crea las tablas de reglas y balances con sus CHECK', () => {
    expect(sql).toContain('create table if not exists public.subscription_rules');
    expect(sql).toContain('create table if not exists public.user_subscription_balances');
    expect(sql).toContain('check (credits_remaining between 0 and credits_total)');
    expect(sql).toContain('check ((window_start is null) = (window_end is null))');
    expect(sql).toContain('check (window_start is null or window_start < window_end)');
    expect(sql).toContain('allowed_class_types public.class_type[] not null');
  });
});
