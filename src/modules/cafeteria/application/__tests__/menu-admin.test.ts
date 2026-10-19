import { describe, it, expect, beforeEach } from 'vitest';
import { CafeteriaError } from '../../domain/errors';
import { sampleCategories, sampleProducts } from '../../domain/__tests__/fixtures';
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getRegisterData,
  loadPublicMenu,
  setProductAvailability,
  updateCategory,
  updateProduct,
  type ProductInput,
} from '../use-cases/menu';
import { admin, barAccount, barra, InMemoryStore, makeDeps, people } from './in-memory';

/** Menú del admin (SPEC-CAFETERIA D5, D7, D10, TASK-CF-APP-04). */

let store: InMemoryStore;
let ctx: ReturnType<typeof makeDeps>;

beforeEach(() => {
  store = new InMemoryStore({ categories: structuredClone(sampleCategories), products: structuredClone(sampleProducts), users: people, barAccount });
  ctx = makeDeps(store);
});

async function rejection(promise: Promise<unknown>): Promise<CafeteriaError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CafeteriaError) return error;
    throw error;
  }
  throw new Error('no rechazó');
}

const product = (overrides: Partial<ProductInput>): ProductInput => ({
  categoryId: 'cafe', name: 'Mocha', priceCents: 7250, temperature: 'hot', sortOrder: 0, isActive: true, isAvailable: true, ...overrides,
});

describe('categorías', () => {
  it('crea un padre con temperatura y una subcategoría; invalida el caché', async () => {
    const tes = await createCategory(ctx.deps, admin, { name: ' Tés ', parentId: null, usesTemperature: true, sortOrder: 3, isActive: true });
    await createCategory(ctx.deps, admin, { name: 'Verdes', parentId: tes.id, usesTemperature: false, sortOrder: 0, isActive: true });
    expect(store.state.categories.find((c) => c.id === tes.id)).toMatchObject({ name: 'Tés', usesTemperature: true });
    expect(ctx.menuCache.invalidations).toBe(2);
  });

  it('dos niveles máximo; temperatura solo en el padre; nombre único entre hermanas', async () => {
    expect((await rejection(createCategory(ctx.deps, admin, { name: 'X', parentId: 'cafe', usesTemperature: false, sortOrder: 0, isActive: true }))).field).toBe('parentId');
    expect((await rejection(createCategory(ctx.deps, admin, { name: 'X', parentId: 'bebidas', usesTemperature: true, sortOrder: 0, isActive: true }))).field).toBe('usesTemperature');
    expect((await rejection(createCategory(ctx.deps, admin, { name: 'café', parentId: 'bebidas', usesTemperature: false, sortOrder: 0, isActive: true }))).code).toBe('CONFLICT');
    expect(ctx.menuCache.invalidations).toBe(0);
  });

  it('apagar «Usa temperatura» con bebidas que la tienen → rechazo con la lista', async () => {
    const e = await rejection(updateCategory(ctx.deps, admin, 'bebidas', { name: 'Bebidas', parentId: null, usesTemperature: false, sortOrder: 1, isActive: true }));
    expect(e.field).toBe('usesTemperature');
    expect((e.details as { products: string[] }).products).toContain('Latte');
  });

  it('mover una subcategoría de comida a bebidas exige temperatura en sus productos', async () => {
    const e = await rejection(updateCategory(ctx.deps, admin, 'postres', { name: 'Postres', parentId: 'bebidas', usesTemperature: false, sortOrder: 1, isActive: true }));
    expect(e.message).toBe('Antes, marca frío o caliente en: Brownie.');
  });

  it('no se elimina con subcategorías o productos; el borrado es lógico', async () => {
    expect((await rejection(deleteCategory(ctx.deps, admin, 'comida'))).code).toBe('CONFLICT');
    await deleteProduct(ctx.deps, admin, 'panini');
    await deleteCategory(ctx.deps, admin, 'sandwiches');
    expect(store.state.categories.find((c) => c.id === 'sandwiches')?.deletedAt).toEqual(ctx.clock.now());
  });

  it('solo admin', async () => {
    expect((await rejection(createCategory(ctx.deps, barra, { name: 'X', parentId: null, usesTemperature: false, sortOrder: 0, isActive: true }))).code).toBe('FORBIDDEN');
  });
});

describe('productos', () => {
  it('bebida: temperatura obligatoria; frío y caliente del mismo nombre conviven', async () => {
    expect((await rejection(createProduct(ctx.deps, admin, product({ temperature: null })))).field).toBe('temperature');
    await createProduct(ctx.deps, admin, product({ name: 'Mocha', temperature: 'hot' }));
    await createProduct(ctx.deps, admin, product({ name: 'Mocha', temperature: 'cold', priceCents: 7750 }));
    expect((await rejection(createProduct(ctx.deps, admin, product({ name: 'mocha', temperature: 'cold' })))).code).toBe('CONFLICT');
  });

  it('comida: sin temperatura; duplicado exacto en la subcategoría → error', async () => {
    expect((await rejection(createProduct(ctx.deps, admin, product({ categoryId: 'postres', name: 'Pay', temperature: 'hot' })))).field).toBe('temperature');
    expect((await rejection(createProduct(ctx.deps, admin, product({ categoryId: 'postres', name: 'Brownie', temperature: null })))).code).toBe('CONFLICT');
  });

  it('precio en centavos válido', async () => {
    for (const priceCents of [0, 1_000_001, 12.5]) {
      expect((await rejection(createProduct(ctx.deps, admin, product({ priceCents })))).field).toBe('price');
    }
  });

  it('editar cambia precio, invalida el caché y lo ve /menu', async () => {
    await updateProduct(ctx.deps, admin, 'latte-hot', product({ name: 'Latte', priceCents: 6800 }));
    expect(ctx.menuCache.invalidations).toBe(1);
    const menu = await loadPublicMenu(ctx.deps.uow);
    expect(menu[0].subcategories[0].items.find((i) => i.id === 'latte-hot')?.priceCents).toBe(6800);
  });

  it('agotado no lo oculta del menú pero sí invalida', async () => {
    await setProductAvailability(ctx.deps, admin, 'brownie', false);
    const menu = await loadPublicMenu(ctx.deps.uow);
    expect(menu[1].subcategories[0].items[0]).toMatchObject({ id: 'brownie', isAvailable: false });
    expect(ctx.menuCache.invalidations).toBe(1);
  });

  it('una operación fallida no invalida', async () => {
    await rejection(updateProduct(ctx.deps, admin, 'nope', product({})));
    expect(ctx.menuCache.invalidations).toBe(0);
  });
});

describe('getRegisterData', () => {
  it('menú visible, elegibles del cupo mensual y la cuenta de barra', async () => {
    store.state.categories.find((c) => c.id === 'bebidas')!.courtesyEligible = true;
    store.state.products.find((p) => p.id === 'agua')!.courtesyOverride = false;
    const data = await getRegisterData(ctx.deps, barra);
    expect(data.barAccount).toEqual(barAccount);
    expect(data.monthlyEligibleIds.sort()).toEqual(['americano', 'frappe-moka', 'latte-cold', 'latte-hot']);
    expect(data.sections.map((s) => s.name)).toEqual(['Bebidas', 'Comida']);
  });
});
