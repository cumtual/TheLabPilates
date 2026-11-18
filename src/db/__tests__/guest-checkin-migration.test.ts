// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardas estáticas del DDL manual del QR de invitados (SPEC-GUEST-QR-CHECKIN §3.1).
 * La BD viva tiene datos reales: el script debe ser aditivo e idempotente.
 */

const DDL_FILE = resolve(process.cwd(), 'sql/manual/2026-11-17_001_guest_checkin_columns.sql');

/** Quita comentarios `--`, normaliza espacios y pasa a minúsculas. */
function loadNormalizedSql(): string {
  return readFileSync(DDL_FILE, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const sql = loadNormalizedSql();

const FORBIDDEN_STATEMENTS = [
  /\bdrop\b/,
  /\btruncate\b/,
  /\balter\s+type\b/,
  /\brename\b/,
  /\bset\s+not\s+null\b/,
  /\balter\s+column\b/,
  /\bcascade\b/,
];

describe('2026-11-17_001_guest_checkin_columns.sql', () => {
  it('no contiene sentencias destructivas', () => {
    for (const pattern of FORBIDDEN_STATEMENTS) {
      expect(sql).not.toMatch(pattern);
    }
    // El único DELETE permitido es la acción referencial de la FK.
    expect(sql.replace(/on delete set null/g, '')).not.toMatch(/\bdelete\b/);
  });

  it('corre en una transacción con lock_timeout', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql).toMatch(/set local lock_timeout = '\d+s';/);
  });

  it.each([
    'checkin_token varchar(64)',
    'checked_in_at timestamptz',
    'checked_in_by uuid',
  ])('agrega %s con IF NOT EXISTS', (definition) => {
    expect(sql).toContain(`alter table public.guest_enrollments add column if not exists ${definition};`);
  });

  it.each([
    'guest_enrollments_checkin_token_unique',
    'guest_enrollments_checked_in_by_users_id_fk',
  ])('crea %s solo si no existe', (name) => {
    expect(sql).toContain(`if not exists ( select 1 from pg_constraint where conname = '${name}'`);
    expect(sql).toContain(`add constraint ${name}`);
  });

  it('la FK de checked_in_by apunta a users y usa ON DELETE SET NULL', () => {
    expect(sql).toContain(
      'foreign key (checked_in_by) references public.users(id) on delete set null;'
    );
  });

  it('no toca datos ni el enum enrollment_status', () => {
    expect(sql).not.toMatch(/\bupdate\b/);
    expect(sql).not.toMatch(/\binsert\b/);
    expect(sql).not.toContain('enrollment_status');
  });
});
