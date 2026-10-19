// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const { cached } = vi.hoisted(() => ({ cached: vi.fn() }));
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: unknown, keys: unknown, options: unknown) => {
    cached(fn, keys, options);
    return fn;
  }),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/db', () => ({ db: {} }));

import { revalidatePath, updateTag } from 'next/cache';
import { invalidateMenuCache, MENU_CACHE_TAG } from '../menu-cache';

/** Caché del menú (SPEC-CAFETERIA D7, TASK-CF-INF-03). */
describe('menu-cache', () => {
  it('getCachedMenu usa la etiqueta y la llave, sin caducidad por tiempo', () => {
    expect(cached).toHaveBeenCalledWith(expect.any(Function), ['cafeteria-menu'], { tags: ['cafeteria-menu'] });
    expect(MENU_CACHE_TAG).toBe('cafeteria-menu');
  });

  it('invalidateMenuCache expira la etiqueta y /menu', () => {
    invalidateMenuCache();
    expect(updateTag).toHaveBeenCalledWith('cafeteria-menu');
    expect(revalidatePath).toHaveBeenCalledWith('/menu');
  });
});
