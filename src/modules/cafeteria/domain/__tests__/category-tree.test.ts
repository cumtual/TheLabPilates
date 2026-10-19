import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildMenuTree,
  categoryDeletionBlocker,
  categoryPath,
  flattenMenu,
  indexCategories,
  isProductNameTaken,
  isProductSellable,
  isProductVisible,
  productsBreakingTemperatureRule,
  validateCategoryPlacement,
  validateProductTemperature,
} from '../category-tree';
import { CafeteriaError } from '../errors';
import {
  agua,
  americano,
  bebidas,
  brownie,
  cafe,
  category,
  comida,
  frappeMoka,
  latteCold,
  latteHot,
  panini,
  postres,
  product,
  sampleCategories,
  sampleProducts,
} from './fixtures';

/** Árbol de categorías (SPEC-CAFETERIA D10, A1, A10, TASK-CF-DOM-05). */

const index = indexCategories(sampleCategories);

function errorOf(fn: () => void): CafeteriaError {
  try {
    fn();
  } catch (error) {
    if (error instanceof CafeteriaError) return error;
    throw error;
  }
  throw new Error('no lanzó');
}

describe('profundidad máxima de dos niveles', () => {
  it('una subcategoría bajo otra subcategoría → error', () => {
    const e = errorOf(() => validateCategoryPlacement({ name: 'Espresso', parentId: 'cafe', usesTemperature: false }, sampleCategories));
    expect(e).toMatchObject({ code: 'INVALID', field: 'parentId' });
  });

  it('una categoría con hijas no puede volverse hija', () => {
    const e = errorOf(() => validateCategoryPlacement({ id: 'comida', name: 'Comida', parentId: 'bebidas', usesTemperature: false }, sampleCategories));
    expect(e.message).toMatch(/tiene subcategorías/);
  });

  it('no puede ser su propio padre', () => {
    const e = errorOf(() => validateCategoryPlacement({ id: 'cafe', name: 'Café', parentId: 'cafe', usesTemperature: false }, sampleCategories));
    expect(e.message).toMatch(/su propio padre/);
  });

  it('el padre debe existir y no estar eliminado', () => {
    const deleted = category({ id: 'old', name: 'Vieja', deletedAt: new Date() });
    const e = errorOf(() => validateCategoryPlacement({ name: 'X', parentId: 'old', usesTemperature: false }, [...sampleCategories, deleted]));
    expect(e.code).toBe('NOT_FOUND');
  });

  it('una subcategoría válida pasa', () => {
    expect(() => validateCategoryPlacement({ name: 'Tés', parentId: 'bebidas', usesTemperature: false }, sampleCategories)).not.toThrow();
  });
});

describe('temperatura (A1)', () => {
  it('«Usa temperatura» solo en el padre', () => {
    const e = errorOf(() => validateCategoryPlacement({ name: 'Tés', parentId: 'bebidas', usesTemperature: true }, sampleCategories));
    expect(e.field).toBe('usesTemperature');
  });

  it('bebida (raíz con temperatura) exige cold/hot, también en la subcategoría', () => {
    expect(errorOf(() => validateProductTemperature(null, 'cafe', index)).field).toBe('temperature');
    expect(errorOf(() => validateProductTemperature(null, 'bebidas', index)).field).toBe('temperature');
    expect(() => validateProductTemperature('cold', 'cafe', index)).not.toThrow();
  });

  it('comida no acepta temperatura', () => {
    expect(() => validateProductTemperature(null, 'postres', index)).not.toThrow();
    expect(errorOf(() => validateProductTemperature('hot', 'postres', index)).message).toBe('Esta categoría no usa temperatura.');
  });

  it('cambiar el interruptor devuelve los productos que faltan', () => {
    expect(productsBreakingTemperatureRule('bebidas', false, sampleCategories, sampleProducts).map((p) => p.id).sort()).toEqual(
      ['agua', 'americano', 'frappe-moka', 'latte-cold', 'latte-hot'].sort()
    );
    expect(productsBreakingTemperatureRule('comida', true, sampleCategories, sampleProducts).map((p) => p.id)).toEqual(['brownie', 'panini']);
    expect(productsBreakingTemperatureRule('bebidas', true, sampleCategories, sampleProducts)).toEqual([]);
  });
});

describe('visibilidad', () => {
  it('visible solo si él, su categoría y su padre están activos y no eliminados', () => {
    expect(isProductVisible(latteHot, index)).toBe(true);
    expect(isProductVisible({ ...latteHot, isActive: false }, index)).toBe(false);
    expect(isProductVisible({ ...latteHot, deletedAt: new Date() }, index)).toBe(false);
    expect(isProductVisible(latteHot, indexCategories([{ ...bebidas, isActive: false }, cafe]))).toBe(false);
    expect(isProductVisible(latteHot, indexCategories([bebidas, { ...cafe, deletedAt: new Date() }]))).toBe(false);
  });

  it('agotado se ve pero no se vende', () => {
    const soldOut = { ...brownie, isAvailable: false };
    expect(isProductVisible(soldOut, index)).toBe(true);
    expect(isProductSellable(soldOut, index)).toBe(false);
  });

  it('desactivar un padre oculta toda su rama', () => {
    const tree = buildMenuTree(sampleCategories.map((c) => (c.id === 'comida' ? { ...c, isActive: false } : c)), sampleProducts);
    expect(tree.map((s) => s.name)).toEqual(['Bebidas']);
  });
});

describe('borrado', () => {
  it('no se elimina con subcategorías o productos', () => {
    expect(categoryDeletionBlocker('comida', sampleCategories, sampleProducts)).toBe('Tiene 2 subcategorías. Elimínalos o muévelos primero.');
    expect(categoryDeletionBlocker('bebidas', sampleCategories, sampleProducts)).toBe('Tiene 2 subcategorías y 1 producto. Elimínalos o muévelos primero.');
    expect(categoryDeletionBlocker('postres', sampleCategories, sampleProducts)).toMatch(/1 producto/);
    expect(categoryDeletionBlocker('postres', sampleCategories, [{ ...brownie, deletedAt: new Date() }])).toBeNull();
  });
});

describe('nombres', () => {
  it('dos subcategorías con el mismo nombre en padres distintos conviven', () => {
    const especiales = category({ id: 'esp', name: 'Especiales', parentId: 'bebidas' });
    expect(() => validateCategoryPlacement({ name: 'especiales', parentId: 'comida', usesTemperature: false }, [...sampleCategories, especiales])).not.toThrow();
  });

  it('en el mismo padre no (sin distinguir mayúsculas)', () => {
    expect(errorOf(() => validateCategoryPlacement({ name: 'POSTRES', parentId: 'comida', usesTemperature: false }, sampleCategories)).code).toBe('CONFLICT');
    expect(errorOf(() => validateCategoryPlacement({ name: 'bebidas', parentId: null, usesTemperature: true }, sampleCategories)).code).toBe('CONFLICT');
    expect(() => validateCategoryPlacement({ id: 'postres', name: 'Postres', parentId: 'comida', usesTemperature: false }, sampleCategories)).not.toThrow();
  });

  it('Latte frío y caliente conviven (D5); comida duplicada no', () => {
    expect(isProductNameTaken({ name: 'latte', categoryId: 'cafe', temperature: 'hot' }, sampleProducts)).toBe(true);
    expect(isProductNameTaken({ name: 'Mocha', categoryId: 'cafe', temperature: 'hot' }, sampleProducts)).toBe(false);
    expect(isProductNameTaken({ name: 'Latte', categoryId: 'cafe', temperature: 'hot' }, [latteCold])).toBe(false);
    expect(isProductNameTaken({ name: 'Brownie', categoryId: 'postres', temperature: null }, sampleProducts)).toBe(true);
    expect(isProductNameTaken({ name: 'Brownie', categoryId: 'postres', temperature: null }, sampleProducts, 'brownie')).toBe(false);
  });

  it('categoryPath', () => {
    expect(categoryPath(postres, index)).toBe('Comida › Postres');
    expect(categoryPath(comida, index)).toBe('Comida');
  });
});

describe('buildMenuTree', () => {
  it('padre › subcategorías › productos en orden, con los del padre primero', () => {
    const tree = buildMenuTree(sampleCategories, sampleProducts);
    expect(tree.map((s) => s.name)).toEqual(['Bebidas', 'Comida']);
    expect(tree[0].items.map((i) => i.id)).toEqual(['agua']);
    expect(tree[0].subcategories.map((s) => s.name)).toEqual(['Café', 'Frappés']);
    expect(tree[0].subcategories[0].items.map((i) => i.id)).toEqual(['latte-hot', 'latte-cold', 'americano']);
    expect(tree[1].subcategories.map((s) => s.name)).toEqual(['Postres', 'Sandwiches']);
    expect(flattenMenu(tree).map((i) => i.id)).toEqual(['agua', 'latte-hot', 'latte-cold', 'americano', 'frappe-moka', 'brownie', 'panini']);
    expect(flattenMenu(tree).find((i) => i.id === 'brownie')?.rootCategoryId).toBe('comida');
  });

  it('las ramas sin productos visibles no aparecen', () => {
    const tree = buildMenuTree(sampleCategories, [latteHot, { ...panini, isActive: false }]);
    expect(tree.map((s) => s.name)).toEqual(['Bebidas']);
    expect(tree[0].subcategories.map((s) => s.name)).toEqual(['Café']);
  });

  it('propiedad: ningún nodo oculto aparece en el árbol', () => {
    const flags = fc.record({ isActive: fc.boolean(), deleted: fc.boolean() });
    fc.assert(
      fc.property(fc.array(flags, { minLength: 6, maxLength: 6 }), fc.array(flags, { minLength: 7, maxLength: 7 }), (catFlags, prodFlags) => {
        const categories = sampleCategories.map((c, i) => ({ ...c, isActive: catFlags[i].isActive, deletedAt: catFlags[i].deleted ? new Date() : null }));
        const products = [agua, latteHot, latteCold, americano, frappeMoka, brownie, panini].map((p, i) =>
          product({ ...p, isActive: prodFlags[i].isActive, deletedAt: prodFlags[i].deleted ? new Date() : null })
        );
        const idx = indexCategories(categories);
        const shown = new Set(flattenMenu(buildMenuTree(categories, products)).map((i) => i.id));
        for (const p of products) expect(shown.has(p.id)).toBe(isProductVisible(p, idx));
      })
    );
  });
});
