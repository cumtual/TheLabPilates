import type { CategoryRecord, ProductRecord } from '../category-tree';

/** Menú de ejemplo: Bebidas (usa temperatura) › Café, Frappés; Comida › Postres, Sandwiches. */

export function category(overrides: Partial<CategoryRecord> & Pick<CategoryRecord, 'id' | 'name'>): CategoryRecord {
  return {
    parentId: null,
    usesTemperature: false,
    sortOrder: 0,
    isActive: true,
    courtesyEligible: null,
    deletedAt: null,
    ...overrides,
  };
}

export function product(
  overrides: Partial<ProductRecord> & Pick<ProductRecord, 'id' | 'name' | 'categoryId'>
): ProductRecord {
  return {
    priceCents: 5000,
    temperature: null,
    courtesyOverride: null,
    isAvailable: true,
    isActive: true,
    sortOrder: 0,
    deletedAt: null,
    ...overrides,
  };
}

export const bebidas = category({ id: 'bebidas', name: 'Bebidas', usesTemperature: true, sortOrder: 1 });
export const cafe = category({ id: 'cafe', name: 'Café', parentId: 'bebidas', sortOrder: 1 });
export const frappes = category({ id: 'frappes', name: 'Frappés', parentId: 'bebidas', sortOrder: 2 });
export const comida = category({ id: 'comida', name: 'Comida', sortOrder: 2 });
export const postres = category({ id: 'postres', name: 'Postres', parentId: 'comida', sortOrder: 1 });
export const sandwiches = category({ id: 'sandwiches', name: 'Sandwiches', parentId: 'comida', sortOrder: 2 });

export const sampleCategories = [bebidas, cafe, frappes, comida, postres, sandwiches];

export const latteHot = product({ id: 'latte-hot', name: 'Latte', categoryId: 'cafe', temperature: 'hot', priceCents: 6500 });
export const latteCold = product({ id: 'latte-cold', name: 'Latte', categoryId: 'cafe', temperature: 'cold', priceCents: 7000, sortOrder: 1 });
export const americano = product({ id: 'americano', name: 'Americano', categoryId: 'cafe', temperature: 'hot', priceCents: 4250, sortOrder: 2 });
export const frappeMoka = product({ id: 'frappe-moka', name: 'Frappé moka', categoryId: 'frappes', temperature: 'cold', priceCents: 8500 });
export const brownie = product({ id: 'brownie', name: 'Brownie', categoryId: 'postres', priceCents: 4500 });
export const panini = product({ id: 'panini', name: 'Panini', categoryId: 'sandwiches', priceCents: 9500 });
export const agua = product({ id: 'agua', name: 'Agua', categoryId: 'bebidas', temperature: 'cold', priceCents: 2000 });

export const sampleProducts = [latteHot, latteCold, americano, frappeMoka, brownie, panini, agua];
