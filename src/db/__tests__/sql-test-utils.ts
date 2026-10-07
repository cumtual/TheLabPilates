import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Lee un script de sql/manual sin comentarios `--`, con espacios normalizados y en minúsculas. */
export function loadManualSql(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'sql/manual', fileName), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Sentencias separadas por `;` (el script no usa `;` dentro de literales salvo en bloques DO). */
export function statementsOf(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}
