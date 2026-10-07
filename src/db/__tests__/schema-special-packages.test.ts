// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import {
  classEnrollments,
  subscriptionRules,
  subscriptions,
  userSubscriptionBalances,
  userSubscriptions,
} from '@/db/schema';
import { loadManualSql } from './sql-test-utils';

/** El esquema Drizzle es espejo exacto del DDL manual (SPEC-SPECIAL-PACKAGES §3.2). */

const ddl = loadManualSql('2026-10-07_001_special_packages.sql');

describe('schema — paquetes especiales', () => {
  it('suscriptions tiene las columnas nuevas con sus defaults', () => {
    const c = getTableColumns(subscriptions);
    expect(c.kind).toMatchObject({ name: 'kind', notNull: true, hasDefault: true, default: 'standard' });
    expect(c.validityDays).toMatchObject({ name: 'validity_days', notNull: false, hasDefault: false });
    expect(c.guestCredits).toMatchObject({ name: 'guest_credits', notNull: true, default: 0 });
    expect(c.shortDescription).toMatchObject({ name: 'short_description', notNull: false, length: 49 });
    expect(c.features).toMatchObject({ name: 'features', notNull: true, hasDefault: true });
    expect(c.isFeatured).toMatchObject({ name: 'is_featured', notNull: true, default: false });
    expect(c.displayOrder).toMatchObject({ name: 'display_order', notNull: true, default: 0 });
    expect(c.isActive).toMatchObject({ name: 'is_active', notNull: true, default: true });
    expect(c.deletedAt).toMatchObject({ name: 'deleted_at', notNull: false });
    expect(c.updatedAt).toMatchObject({ name: 'updated_at', notNull: true, hasDefault: true });
  });

  it('las reglas y los balances guardan arreglos del enum class_type', () => {
    expect(getTableName(subscriptionRules)).toBe('subscription_rules');
    expect(getTableName(userSubscriptionBalances)).toBe('user_subscription_balances');
    for (const column of [
      getTableColumns(subscriptionRules).allowedClassTypes,
      getTableColumns(userSubscriptionBalances).allowedClassTypes,
    ]) {
      expect(column.name).toBe('allowed_class_types');
      expect(column.columnType).toBe('PgArray');
      expect(column.notNull).toBe(true);
    }
  });

  it('las columnas nuevas de user_suscriptions y class_enrolleds son nullable y sin default', () => {
    const us = getTableColumns(userSubscriptions);
    for (const column of [us.priceSnapshot, us.validityDaysSnapshot, us.guestCreditsSnapshot, getTableColumns(classEnrollments).balanceId]) {
      expect(column.notNull).toBe(false);
      expect(column.hasDefault).toBe(false);
    }
  });

  it('cada columna nueva del esquema existe en el script 001', () => {
    const newColumns = [
      ...['kind', 'validity_days', 'guest_credits', 'short_description', 'features', 'is_featured', 'display_order', 'is_active', 'deleted_at', 'updated_at'],
      'price_snapshot', 'validity_days_snapshot', 'guest_credits_snapshot', 'balance_id',
    ];
    for (const name of newColumns) expect(ddl).toContain(`add column if not exists ${name} `);
    for (const table of [subscriptionRules, userSubscriptionBalances]) {
      for (const column of Object.values(getTableColumns(table))) {
        expect(ddl).toMatch(new RegExp(`\\b${column.name}\\b`));
      }
    }
  });
});
