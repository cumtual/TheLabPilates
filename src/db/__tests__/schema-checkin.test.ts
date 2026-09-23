// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { classEnrollments, enrollmentStatusEnum } from '@/db/schema';

/**
 * El schema de Drizzle debe reflejar exactamente el DDL manual
 * `sql/manual/2026-09-22_001_qr_checkin_columns.sql` (SPEC-QR-CHECKIN §3.4).
 */

const config = getTableConfig(classEnrollments);

function column(name: string) {
  const found = config.columns.find((c) => c.name === name);
  if (!found) throw new Error(`Columna ${name} no encontrada en class_enrolleds`);
  return found;
}

describe('class_enrolleds — columnas de check-in por QR', () => {
  it('checkin_token es varchar(64), nullable y único con el nombre del DDL', () => {
    const token = column('checkin_token');
    expect(token.columnType).toBe('PgVarchar');
    expect((token as unknown as { length?: number }).length).toBe(64);
    expect(token.notNull).toBe(false);
    expect(token.hasDefault).toBe(false);
    expect(token.isUnique).toBe(true);
    expect(token.uniqueName).toBe('class_enrolleds_checkin_token_unique');
  });

  it('checked_in_at es timestamptz nullable y sin default', () => {
    const checkedInAt = column('checked_in_at');
    expect(checkedInAt.columnType).toBe('PgTimestamp');
    expect((checkedInAt as unknown as { withTimezone?: boolean }).withTimezone).toBe(true);
    expect(checkedInAt.notNull).toBe(false);
    expect(checkedInAt.hasDefault).toBe(false);
  });
});

describe('class_enrolleds — estructura existente intacta', () => {
  it('conserva las columnas originales', () => {
    expect(config.name).toBe('class_enrolleds');
    expect(config.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['id', 'open_class_id', 'user_suscription_id', 'status', 'created_at'])
    );
    expect(column('status').default).toBe('pending');
  });

  it('conserva el índice único uk_class_user_enrollment', () => {
    const index = config.indexes.find((i) => i.config.name === 'uk_class_user_enrollment');
    expect(index?.config.unique).toBe(true);
  });

  it('no modifica el enum enrollment_status', () => {
    expect(enrollmentStatusEnum.enumValues).toEqual([
      'pending',
      'attended',
      'absent',
      'late_cancelled',
      'cancelled',
    ]);
  });
});
