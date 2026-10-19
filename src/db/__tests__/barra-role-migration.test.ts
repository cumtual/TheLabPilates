// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadManualSql, statementsOf } from './sql-test-utils';

/** Rol `barra` (SPEC-CAFETERIA §3.2, D1): única excepción aprobada de ALTER TYPE. */

const sql = loadManualSql('2026-10-15_002_barra_role.sql');

describe('2026-10-15_002_barra_role.sql', () => {
  it('solo agrega el valor barra al enum, de forma idempotente y transaccional', () => {
    expect(statementsOf(sql)).toEqual([
      'begin',
      "set local lock_timeout = '5s'",
      "alter type public.user_role add value if not exists 'barra'",
      'commit',
    ]);
  });
});
