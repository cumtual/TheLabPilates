// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Frontera estática: la auditoría de inscripciones solo se importa desde rutas
 * y componentes de admin (SPEC-CANCELLATION-AUDIT-AND-TERMS §3.5).
 */

const FORBIDDEN_ROOTS = [
  'src/app/(portal)/coach',
  'src/app/(portal)/client',
  'src/components/coach',
  'src/components/client',
  'src/app/api',
];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('frontera de importación de admin-enrollment-audit', () => {
  it('ningún archivo de coach, client o API la importa', () => {
    const offenders = FORBIDDEN_ROOTS.flatMap((root) => files(join(process.cwd(), root)))
      .filter((file) => readFileSync(file, 'utf8').includes('admin-enrollment-audit'))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });

  it('la vista de asistencia del coach no lee cancelledAt', () => {
    const coachPage = readFileSync(
      join(process.cwd(), 'src/app/(portal)/coach/attendance/[classId]/page.tsx'),
      'utf8'
    );
    expect(coachPage).not.toMatch(/cancelledAt|formatAuditDateTime|bookedAt/);
  });
});
