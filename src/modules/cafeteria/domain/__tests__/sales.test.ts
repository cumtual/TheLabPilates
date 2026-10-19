import { describe, it, expect } from 'vitest';
import { breakdownByProduct, type SoldLine } from '../sales';

/** Desglose de ventas (SPEC-CAFETERIA §6, TASK-CF-APP-06). */

const line = (overrides: Partial<SoldLine>): SoldLine => ({
  productName: 'Latte',
  categoryName: 'Café',
  parentCategoryName: 'Bebidas',
  temperature: 'hot',
  unitPriceCents: 6500,
  quantity: 1,
  isCourtesy: false,
  courtesySource: null,
  lineTotalCents: 6500,
  ...overrides,
});

describe('breakdownByProduct', () => {
  it('agrupa padre › subcategoría › producto, separa frío/caliente y cortesías por fuente', () => {
    const rows = breakdownByProduct([
      line({ quantity: 2, lineTotalCents: 13000 }),
      line({ isCourtesy: true, courtesySource: 'monthly', lineTotalCents: 0 }),
      line({ isCourtesy: true, courtesySource: 'grant', lineTotalCents: 0 }),
      line({ temperature: 'cold', unitPriceCents: 7000, lineTotalCents: 7000 }),
      line({ productName: 'Brownie', categoryName: 'Postres', parentCategoryName: 'Comida', temperature: null, unitPriceCents: 4500, lineTotalCents: 4500 }),
      line({ productName: 'Agua', categoryName: 'Bebidas', parentCategoryName: null, temperature: 'cold', unitPriceCents: 2000, lineTotalCents: 2000 }),
    ]);
    expect(rows.map((r) => [r.group, r.productName, r.temperature])).toEqual([
      ['Bebidas', 'Agua', 'cold'],
      ['Bebidas › Café', 'Latte', 'cold'],
      ['Bebidas › Café', 'Latte', 'hot'],
      ['Comida › Postres', 'Brownie', null],
    ]);
    expect(rows[2]).toMatchObject({ soldQuantity: 2, revenueCents: 13000, courtesyMonthly: 1, courtesyGrant: 1, courtesyValueCents: 13000 });
  });
});
