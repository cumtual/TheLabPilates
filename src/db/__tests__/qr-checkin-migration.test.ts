// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardas estáticas para los scripts SQL manuales del check-in por QR.
 * La BD viva tiene datos reales: los scripts deben ser aditivos e idempotentes
 * (SPEC-QR-CHECKIN §3 y §8).
 */

const MANUAL_SQL_DIR = resolve(process.cwd(), 'sql/manual');
const DDL_FILE = '2026-09-22_001_qr_checkin_columns.sql';
const BACKFILL_FILE = '2026-09-22_002_qr_checkin_backfill.sql';

/** Quita comentarios `--`, normaliza espacios y pasa a minúsculas. */
function loadNormalizedSql(fileName: string): string {
  const raw = readFileSync(resolve(MANUAL_SQL_DIR, fileName), 'utf8');
  return raw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const FORBIDDEN_STATEMENTS = [
  /\bdrop\b/,
  /\btruncate\b/,
  /\bdelete\b/,
  /\balter\s+type\b/,
  /\brename\b/,
  /\bset\s+not\s+null\b/,
  /\balter\s+column\b/,
  /\bcascade\b/,
];

describe.each([DDL_FILE, BACKFILL_FILE])('%s — reglas de seguridad', (fileName) => {
  it('no contiene sentencias destructivas', () => {
    const sql = loadNormalizedSql(fileName);
    for (const pattern of FORBIDDEN_STATEMENTS) {
      expect(sql).not.toMatch(pattern);
    }
  });

  it('corre en una transacción con lock_timeout', () => {
    const sql = loadNormalizedSql(fileName);
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql).toMatch(/set local lock_timeout = '\d+s';/);
  });
});

describe(`${DDL_FILE} — DDL aditivo e idempotente`, () => {
  const sql = loadNormalizedSql(DDL_FILE);

  it('agrega checkin_token varchar(64) con IF NOT EXISTS', () => {
    expect(sql).toContain(
      'alter table public.class_enrolleds add column if not exists checkin_token varchar(64);'
    );
  });

  it('agrega checked_in_at timestamptz con IF NOT EXISTS', () => {
    expect(sql).toContain(
      'alter table public.class_enrolleds add column if not exists checked_in_at timestamptz;'
    );
  });

  it('crea el constraint único solo si no existe', () => {
    expect(sql).toMatch(
      /if not exists \( select 1 from pg_constraint where conname = 'class_enrolleds_checkin_token_unique'/
    );
    expect(sql).toContain(
      'add constraint class_enrolleds_checkin_token_unique unique (checkin_token);'
    );
  });

  it('no modifica el enum enrollment_status', () => {
    expect(sql).not.toContain('enrollment_status');
  });
});

describe(`${BACKFILL_FILE} — backfill idempotente`, () => {
  const sql = loadNormalizedSql(BACKFILL_FILE);

  it('es un único UPDATE que solo asigna checkin_token', () => {
    expect(sql.match(/\bupdate\b/g)).toHaveLength(1);
    expect(sql.match(/\bset\b/g)).toHaveLength(3); // 2 × SET LOCAL + 1 × SET de la columna
    expect(sql).toMatch(/set checkin_token = /);
    expect(sql).not.toMatch(/,\s*(status|checked_in_at|open_class_id|user_suscription_id)\s*=/);
  });

  it('solo toca reservas pending sin token de clases futuras programadas', () => {
    expect(sql).toContain('ce.checkin_token is null');
    expect(sql).toContain("ce.status = 'pending'");
    expect(sql).toContain("oc.status = 'scheduled'");
    expect(sql).toContain('oc.class_date > now()');
  });

  it('genera tokens de 64 hex con gen_random_uuid() (sin pgcrypto)', () => {
    expect(sql).toContain(
      "replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')"
    );
    expect(sql).not.toContain('gen_random_bytes');
  });
});
