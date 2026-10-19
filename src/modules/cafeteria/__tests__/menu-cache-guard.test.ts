// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
vi.mock('../infrastructure/container', () => ({ cafeteriaDeps: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));

import * as menuUseCases from '../application/use-cases/menu';
import * as menuActions from '../presentation/actions/menu';

/**
 * Guarda estructural del caché (SPEC-CAFETERIA D7, TASK-CF-INF-03): todo caso de uso que
 * cambia el menú pasa por `mutateMenu` (que invalida al terminar bien), toda acción de
 * menú llama a uno de ellos y el contenedor real conecta el caché de Next.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), 'src/modules/cafeteria', path), 'utf8');
const useCases = read('application/use-cases/menu.ts');
const actions = read('presentation/actions/menu.ts');

const MUTATIONS = ['createCategory', 'updateCategory', 'deleteCategory', 'createProduct', 'updateProduct', 'deleteProduct', 'setProductAvailability'];

function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('invalidación del menú', () => {
  it('la lista de mutaciones está completa', () => {
    const exported = Object.keys(menuUseCases).filter((name) => typeof (menuUseCases as Record<string, unknown>)[name] === 'function');
    const reads = exported.filter((name) => /^(get|load)/.test(name));
    expect(exported.filter((name) => !reads.includes(name)).sort()).toEqual([...MUTATIONS].sort());
  });

  it.each(MUTATIONS)('%s pasa por mutateMenu', (name) => {
    expect(bodyOf(useCases, name)).toContain('mutateMenu(deps, actor');
  });

  it('mutateMenu invalida solo después de la transacción', () => {
    const body = useCases.slice(useCases.indexOf('async function mutateMenu'), useCases.indexOf('function missingTemperatureError'));
    expect(body.indexOf('deps.uow.run')).toBeLessThan(body.indexOf('deps.menuCache.invalidate()'));
  });

  it('cada acción de menú llama a su caso de uso', () => {
    const actionNames = Object.keys(menuActions);
    expect(actionNames).toHaveLength(MUTATIONS.length);
    for (const name of MUTATIONS) expect(bodyOf(actions, `${name}Action`)).toMatch(new RegExp(`\\b${name}\\(deps, actor`));
  });

  it('el contenedor real usa el caché de Next', () => {
    expect(read('infrastructure/container.ts')).toContain('menuCache: nextMenuCache');
    expect(read('infrastructure/menu-cache.ts')).toContain('export const nextMenuCache: MenuCache = { invalidate: invalidateMenuCache }');
  });
});
