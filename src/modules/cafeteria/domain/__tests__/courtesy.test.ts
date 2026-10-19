import { describe, it, expect } from 'vitest';
import { indexCategories } from '../category-tree';
import { effectiveCourtesyEligibility, monthlyCourtesyBalance } from '../courtesy';
import { allocateCourtesies, type CourtesySource } from '../courtesy-grants';
import { bebidas, brownie, cafe, comida, latteHot, postres, sampleCategories } from './fixtures';

/** Cupo mensual de coaches (SPEC-CAFETERIA D3, A9, TASK-CF-DOM-02). */

function withEligibility(rootEligible: boolean | null, subEligible: boolean | null) {
  return indexCategories(
    sampleCategories.map((c) =>
      c.id === 'bebidas' ? { ...c, courtesyEligible: rootEligible } : c.id === 'cafe' ? { ...c, courtesyEligible: subEligible } : c
    )
  );
}

describe('elegibilidad con herencia', () => {
  it('padre sí + subcategoría null + producto null → sí (heredado del padre)', () => {
    expect(effectiveCourtesyEligibility(latteHot, withEligibility(true, null))).toEqual({ eligible: true, source: 'parent' });
  });

  it('padre sí + subcategoría no → no', () => {
    expect(effectiveCourtesyEligibility(latteHot, withEligibility(true, false))).toEqual({ eligible: false, source: 'subcategory' });
  });

  it('subcategoría sí bajo padre null → sí', () => {
    expect(effectiveCourtesyEligibility(latteHot, withEligibility(null, true))).toEqual({ eligible: true, source: 'subcategory' });
  });

  it('override false en el producto gana sobre todo', () => {
    expect(effectiveCourtesyEligibility({ ...latteHot, courtesyOverride: false }, withEligibility(true, true))).toEqual({ eligible: false, source: 'product' });
  });

  it('override true en un producto de categoría no elegible → sí', () => {
    expect(effectiveCourtesyEligibility({ ...latteHot, courtesyOverride: true }, withEligibility(false, false))).toEqual({ eligible: true, source: 'product' });
  });

  it('sin ningún valor → no', () => {
    expect(effectiveCourtesyEligibility(latteHot, withEligibility(null, null))).toEqual({ eligible: false, source: 'default' });
  });

  it('un producto que cuelga del padre usa el valor del padre', () => {
    const idx = indexCategories([{ ...comida, courtesyEligible: true }, postres, bebidas, cafe]);
    expect(effectiveCourtesyEligibility({ categoryId: 'comida', courtesyOverride: null }, idx)).toEqual({ eligible: true, source: 'parent' });
    expect(effectiveCourtesyEligibility(brownie, idx).eligible).toBe(true);
  });
});

describe('saldo', () => {
  it('max(0, límite − usadas); límite 0 → nunca hay saldo', () => {
    expect(monthlyCourtesyBalance(4, 1)).toBe(3);
    expect(monthlyCourtesyBalance(4, 6)).toBe(0);
    expect(monthlyCourtesyBalance(0, 0)).toBe(0);
  });
});

describe('asignación con solo el cupo mensual', () => {
  const idx = withEligibility(true, null);
  const monthly = (remaining: number): CourtesySource => ({
    key: 'monthly',
    kind: 'monthly',
    remaining,
    expiresAt: new Date('2026-11-01T05:59:59.999Z'),
    specificity: 1,
    createdAt: new Date('2026-10-01T06:00:00Z'),
    covers: (item) => effectiveCourtesyEligibility({ categoryId: item.categoryId, courtesyOverride: null }, idx).eligible,
  });
  const latte = (key: string) => ({ key, item: { productId: 'latte-hot', categoryId: 'cafe', rootCategoryId: 'bebidas' } });

  it('saldo 2 y 3 elegibles marcados → la tercera queda sin cubrir', () => {
    const result = allocateCourtesies([latte('a'), latte('b'), latte('c')], [monthly(2)]);
    expect([...result.assignments.keys()]).toEqual(['a', 'b']);
    expect(result.uncovered).toEqual(['c']);
  });

  it('un artículo no elegible queda sin cubrir', () => {
    const result = allocateCourtesies([{ key: 'x', item: { productId: 'brownie', categoryId: 'postres', rootCategoryId: 'comida' } }], [monthly(4)]);
    expect(result.uncovered).toEqual(['x']);
  });

  it('un usuario sin fuentes (no coach) no recibe nada', () => {
    expect(allocateCourtesies([latte('a')], []).uncovered).toEqual(['a']);
  });
});
