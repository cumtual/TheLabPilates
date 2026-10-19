import { revalidatePath, unstable_cache, updateTag } from 'next/cache';
import type { MenuSection } from '../domain/category-tree';
import type { MenuCache } from '../application/ports';
import { loadPublicMenu } from '../application/use-cases/menu';
import { drizzleUnitOfWork } from './drizzle-unit-of-work';

/**
 * Caché del menú público (SPEC-CAFETERIA D7, §7). Sin caducidad por tiempo: solo se
 * invalida cuando el admin cambia el menú. `updateTag` se verificó en un build real
 * (TASK-CF-CACHE-00) y solo puede llamarse desde Server Actions.
 */
export const MENU_CACHE_TAG = 'cafeteria-menu';
export const MENU_PATH = '/menu';

export const getCachedMenu: () => Promise<MenuSection[]> = unstable_cache(
  () => loadPublicMenu(drizzleUnitOfWork),
  [MENU_CACHE_TAG],
  { tags: [MENU_CACHE_TAG] }
);

export function invalidateMenuCache(): void {
  updateTag(MENU_CACHE_TAG);
  revalidatePath(MENU_PATH);
}

export const nextMenuCache: MenuCache = { invalidate: invalidateMenuCache };
