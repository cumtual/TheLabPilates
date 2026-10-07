// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * INV-3 (SPEC-SPECIAL-PACKAGES §5.1): solo `src/lib/subscription/credits.ts` modifica
 * saldos (`days_remaining ± n`, `credits_remaining`). Así INV-1 (total = Σ grupos) no se
 * puede romper desde otra acción. Los reinicios a 0 en estados terminales (compra,
 * suspendida → vencida) no son aritmética y quedan permitidos.
 */

const ROOT = process.cwd();
const ALLOWED = 'src/lib/subscription/credits.ts';

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: 'SQL days_remaining = days_remaining ±', pattern: /days_remaining\s*=\s*days_remaining/ },
  { name: 'Drizzle daysRemaining: sql`…`', pattern: /daysRemaining\s*:\s*sql/ },
  { name: 'credits_remaining (SQL)', pattern: /credits_remaining/ },
  { name: 'creditsRemaining en .set()/.values() (Drizzle)', pattern: /\.(set|values)\(\{[^}]*creditsRemaining\s*:/ },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe('INV-3: un solo escritor de créditos', () => {
  const files = [...sourceFiles(join(ROOT, 'src/actions')), ...sourceFiles(join(ROOT, 'src/lib'))]
    .map((path) => relative(ROOT, path))
    .filter((path) => path !== ALLOWED);

  it.each(FORBIDDEN)('ningún archivo fuera de credits.ts contiene: $name', ({ pattern }) => {
    const offenders = files.filter((path) => pattern.test(readFileSync(join(ROOT, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('el módulo permitido sí contiene las escrituras (la guarda no es vacía)', () => {
    const credits = readFileSync(join(ROOT, ALLOWED), 'utf8');
    for (const { pattern } of FORBIDDEN) expect(credits).toMatch(pattern);
  });
});
