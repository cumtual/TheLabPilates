// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardas estáticas del script manual de auditoría de cancelaciones.
 * La BD viva tiene datos reales: el script debe ser aditivo e idempotente
 * (SPEC-CANCELLATION-AUDIT-AND-TERMS §2.1).
 */

const FILE = resolve(process.cwd(), 'sql/manual/2026-09-24_001_enrollment_cancelled_at.sql');

/** Quita comentarios `--`, normaliza espacios y pasa a minúsculas. */
function loadNormalizedSql(): string {
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const sql = loadNormalizedSql();

describe('2026-09-24_001_enrollment_cancelled_at.sql', () => {
  it('no contiene sentencias destructivas ni reescrituras de datos', () => {
    for (const pattern of [
      /\bdrop\b/,
      /\btruncate\b/,
      /\bdelete\b/,
      /\bupdate\b/,
      /\bdefault\b/,
      /\bnot null\b/,
      /\balter\s+column\b/,
      /\brename\b/,
      /\bcascade\b/,
    ]) {
      expect(sql).not.toMatch(pattern);
    }
  });

  it('corre en una transacción con lock_timeout', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql).toMatch(/set local lock_timeout = '\d+s';/);
  });

  it.each(['class_enrolleds', 'guest_enrollments'])(
    'agrega %s.cancelled_at timestamptz nullable con IF NOT EXISTS',
    (table) => {
      expect(sql).toContain(
        `alter table public.${table} add column if not exists cancelled_at timestamp with time zone null;`
      );
    }
  );

  it('solo contiene los dos ALTER TABLE esperados', () => {
    expect(sql.match(/\balter table\b/g)).toHaveLength(2);
  });
});
