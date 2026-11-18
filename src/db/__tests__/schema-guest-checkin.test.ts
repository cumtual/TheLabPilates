// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { guestEnrollments } from '@/db/schema';

/**
 * El schema de Drizzle refleja el DDL manual
 * `sql/manual/2026-11-17_001_guest_checkin_columns.sql` (SPEC-GUEST-QR-CHECKIN §3.3).
 */

const config = getTableConfig(guestEnrollments);

function column(name: string) {
  const found = config.columns.find((c) => c.name === name);
  if (!found) throw new Error(`Columna ${name} no encontrada en guest_enrollments`);
  return found;
}

describe('guest_enrollments — columnas de check-in por QR', () => {
  it('checkin_token es varchar(64), nullable y único con el nombre del DDL', () => {
    const token = column('checkin_token');
    expect(token.columnType).toBe('PgVarchar');
    expect((token as unknown as { length?: number }).length).toBe(64);
    expect(token.notNull).toBe(false);
    expect(token.hasDefault).toBe(false);
    expect(token.isUnique).toBe(true);
    expect(token.uniqueName).toBe('guest_enrollments_checkin_token_unique');
  });

  it('checked_in_at es timestamptz nullable y sin default', () => {
    const checkedInAt = column('checked_in_at');
    expect(checkedInAt.columnType).toBe('PgTimestamp');
    expect((checkedInAt as unknown as { withTimezone?: boolean }).withTimezone).toBe(true);
    expect(checkedInAt.notNull).toBe(false);
    expect(checkedInAt.hasDefault).toBe(false);
  });

  it('checked_in_by es uuid nullable con FK a users (ON DELETE SET NULL)', () => {
    const checkedInBy = column('checked_in_by');
    expect(checkedInBy.columnType).toBe('PgUUID');
    expect(checkedInBy.notNull).toBe(false);
    const fk = config.foreignKeys.find((f) => f.reference().columns[0]?.name === 'checked_in_by');
    expect(fk).toBeDefined();
    expect(getTableConfig(fk!.reference().foreignTable).name).toBe('users');
    expect(fk!.onDelete).toBe('set null');
  });
});

describe('guest_enrollments — estructura existente intacta', () => {
  it('conserva las columnas originales', () => {
    expect(config.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id',
        'open_class_id',
        'guest_name',
        'origin',
        'registered_by_id',
        'status',
        'created_at',
        'cancelled_at',
      ])
    );
    expect(column('status').default).toBe('pending');
  });
});
