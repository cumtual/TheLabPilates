import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CafeteriaError } from '../errors';
import { buildOrderLines, courtesyValue, orderTotal, resolvePaymentMethod, type SellableProduct } from '../order';

/** Pedido (SPEC-CAFETERIA §4.3, TASK-CF-DOM-03). */

const latte: SellableProduct = {
  id: 'latte', name: 'Latte', priceCents: 6550, temperature: 'hot', categoryId: 'cafe', rootCategoryId: 'bebidas',
  categoryName: 'Café', parentCategoryName: 'Bebidas', sellable: true,
};
const brownie: SellableProduct = {
  id: 'brownie', name: 'Brownie', priceCents: 4500, temperature: null, categoryId: 'postres', rootCategoryId: 'comida',
  categoryName: 'Postres', parentCategoryName: 'Comida', sellable: true,
};
const menu = new Map([latte, brownie, { ...brownie, id: 'agotado', name: 'Pay', sellable: false }].map((p) => [p.id, p]));

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as CafeteriaError).code;
  }
  return null;
};

describe('buildOrderLines', () => {
  it('las copias y el precio salen del producto; la cortesía vale 0', () => {
    const lines = buildOrderLines(
      [{ productId: 'latte', quantity: 2, courtesy: false }, { productId: 'latte', quantity: 1, courtesy: true }, { productId: 'brownie', quantity: 1, courtesy: false }],
      menu
    );
    expect(lines[0]).toMatchObject({ productName: 'Latte', categoryName: 'Café', parentCategoryName: 'Bebidas', temperature: 'hot', unitPriceCents: 6550, lineTotalCents: 13100 });
    expect(lines[1]).toMatchObject({ isCourtesy: true, lineTotalCents: 0, unitPriceCents: 6550 });
    expect(orderTotal(lines)).toBe(13100 + 4500);
    expect(courtesyValue(lines)).toBe(6550);
  });

  it('límites: vacío, más de 30 líneas, cantidad fuera de 1–20, cortesía de más de 1', () => {
    expect(codeOf(() => buildOrderLines([], menu))).toBe('INVALID');
    expect(codeOf(() => buildOrderLines(Array.from({ length: 31 }, () => ({ productId: 'latte', quantity: 1, courtesy: false })), menu))).toBe('INVALID');
    expect(() => buildOrderLines(Array.from({ length: 30 }, () => ({ productId: 'latte', quantity: 1, courtesy: false })), menu)).not.toThrow();
    for (const quantity of [0, 21, 1.5]) expect(codeOf(() => buildOrderLines([{ productId: 'latte', quantity, courtesy: false }], menu))).toBe('INVALID');
    expect(codeOf(() => buildOrderLines([{ productId: 'latte', quantity: 2, courtesy: true }], menu))).toBe('INVALID');
  });

  it('producto agotado o inexistente → PRODUCT_UNAVAILABLE', () => {
    expect(codeOf(() => buildOrderLines([{ productId: 'agotado', quantity: 1, courtesy: false }], menu))).toBe('PRODUCT_UNAVAILABLE');
    expect(codeOf(() => buildOrderLines([{ productId: 'nope', quantity: 1, courtesy: false }], menu))).toBe('PRODUCT_UNAVAILABLE');
  });
});

describe('método de pago', () => {
  it('100 % cortesía → sin método; total > 0 exige método', () => {
    expect(resolvePaymentMethod(0, 'cash')).toBeNull();
    expect(resolvePaymentMethod(100, 'transfer')).toBe('transfer');
    expect(codeOf(() => resolvePaymentMethod(100, null))).toBe('INVALID');
  });
});

describe('propiedad', () => {
  it('total = Σ unit × qty de las líneas que no son cortesía', () => {
    const line = fc.record({ productId: fc.constantFrom('latte', 'brownie'), quantity: fc.integer({ min: 1, max: 20 }), courtesy: fc.boolean() }).map((l) =>
      l.courtesy ? { ...l, quantity: 1 } : l
    );
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 30 }), (inputs) => {
        const expected = inputs.filter((i) => !i.courtesy).reduce((sum, i) => sum + menu.get(i.productId)!.priceCents * i.quantity, 0);
        expect(orderTotal(buildOrderLines(inputs, menu))).toBe(expected);
      })
    );
  });
});

describe('descuento por membresía (D13)', () => {
  it('redondea al centavo (la mitad sube) y nunca pasa del subtotal', async () => {
    const { discountCents } = await import('../order');
    expect(discountCents(13100, 10)).toBe(1310);
    expect(discountCents(4255, 10)).toBe(426); // 425.5 → 426
    expect(discountCents(4254, 10)).toBe(425);
    expect(discountCents(500, 0)).toBe(0);
    expect(discountCents(500, 100)).toBe(500);
    expect(discountCents(0, 10)).toBe(0);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 0, max: 100 }), (subtotal, percent) => {
        const d = discountCents(subtotal, percent);
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(subtotal);
        expect(Math.abs(d - (subtotal * percent) / 100)).toBeLessThanOrEqual(0.5);
      })
    );
  });
});
