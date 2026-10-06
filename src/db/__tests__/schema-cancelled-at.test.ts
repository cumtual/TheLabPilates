// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { classEnrollments, guestEnrollments } from '@/db/schema';

/**
 * El schema de Drizzle debe reflejar el DDL manual
 * `sql/manual/2026-09-24_001_enrollment_cancelled_at.sql`.
 */
describe.each([
  ['class_enrolleds', classEnrollments],
  ['guest_enrollments', guestEnrollments],
] as const)('%s.cancelled_at', (tableName, table) => {
  const config = getTableConfig(table as PgTable);
  const column = config.columns.find((c) => c.name === 'cancelled_at');

  it('existe en la tabla correcta', () => {
    expect(config.name).toBe(tableName);
    expect(column).toBeDefined();
  });

  it('es timestamptz nullable y sin default (lo fija solo el flujo de cancelación)', () => {
    expect(column?.columnType).toBe('PgTimestamp');
    expect((column as unknown as { withTimezone?: boolean }).withTimezone).toBe(true);
    expect(column?.notNull).toBe(false);
    expect(column?.hasDefault).toBe(false);
  });
});
