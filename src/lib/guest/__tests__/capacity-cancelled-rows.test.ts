// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { getTotalOccupied } from '@/lib/guest/capacity';

/**
 * Regresión (SPEC-CANCELLATION-AUDIT-AND-TERMS H1 / TASK-CA-BE-06): la cancelación
 * a tiempo ya no borra la fila, así que el cupo DEBE excluir `cancelled` y
 * `late_cancelled` a nivel SQL o una cancelación seguiría ocupando lugar.
 */

vi.mock('@/db', () => ({ db: {} }));

const dialect = new PgDialect();

describe('getTotalOccupied — filas canceladas no ocupan cupo', () => {
  it('ambas consultas (titulares e invitados) excluyen cancelled y late_cancelled', async () => {
    const wheres: unknown[] = [];
    const conn = {
      select: () => ({
        from: () => ({
          where: (cond: unknown) => {
            wheres.push(cond);
            return Promise.resolve([{ count: 0 }]);
          },
        }),
      }),
      query: {},
    };

    await getTotalOccupied('class-1', conn as never);

    expect(wheres).toHaveLength(2);
    for (const where of wheres) {
      const { sql, params } = dialect.sqlToQuery(where as SQL);
      expect(sql).toMatch(/"status" not in \(\$2, \$3\)/);
      expect(params).toEqual(['class-1', 'cancelled', 'late_cancelled']);
    }
  });
});
