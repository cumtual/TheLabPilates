// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Regla de dependencias de Clean Architecture (SPEC-CAFETERIA §10, TASK-CF-ARCH-01).
 * Los tests (`__tests__`) quedan fuera: pueden usar lo que necesiten.
 */

const root = resolve(process.cwd(), 'src/modules/cafeteria');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);
}

/** Capa a la que apunta un import relativo, o `null` si sale del módulo. */
function layerOf(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const target = relative(root, resolve(file, '..', specifier));
  return target.startsWith('..') ? 'outside' : target.split('/')[0];
}

const layer = (name: string) => sourceFiles(join(root, name));

describe('fronteras del módulo de cafetería', () => {
  it('cada capa tiene código', () => {
    for (const name of ['domain', 'application', 'infrastructure', 'presentation']) {
      expect(layer(name).length, name).toBeGreaterThan(0);
    }
  });

  it('domain no importa nada del proyecto ni de frameworks', () => {
    for (const file of layer('domain')) {
      for (const spec of importsOf(file)) {
        expect(spec.startsWith('./'), `${relative(root, file)} → ${spec}`).toBe(true);
      }
    }
  });

  it('application solo importa domain (y a sí misma)', () => {
    for (const file of layer('application')) {
      for (const spec of importsOf(file)) {
        expect(['domain', 'application'], `${relative(root, file)} → ${spec}`).toContain(layerOf(file, spec));
      }
    }
  });

  it('infrastructure no importa presentation', () => {
    for (const file of layer('infrastructure')) {
      for (const spec of importsOf(file)) {
        expect(layerOf(file, spec), `${relative(root, file)} → ${spec}`).not.toBe('presentation');
        expect(spec.includes('modules/cafeteria/presentation'), `${relative(root, file)} → ${spec}`).toBe(false);
      }
    }
  });

  it('el resto de la app entra por presentation (o por infrastructure para el caché), nunca por application', () => {
    const outside = ['src/app', 'src/components', 'src/actions'].flatMap((dir) => sourceFiles(resolve(process.cwd(), dir)));
    for (const file of outside) {
      for (const spec of importsOf(file)) {
        expect(spec.startsWith('@/modules/cafeteria/application'), `${relative(process.cwd(), file)} → ${spec}`).toBe(false);
      }
    }
  });
});
