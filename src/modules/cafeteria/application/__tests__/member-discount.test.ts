import { describe, it, expect, beforeEach } from 'vitest';
import { sampleCategories, sampleProducts } from '../../domain/__tests__/fixtures';
import { createOrder } from '../use-cases/create-order';
import { createClosing, getPendingClosings } from '../use-cases/closings';
import { searchCustomers } from '../use-cases/courtesies';
import { getSalesReport } from '../use-cases/sales';
import { admin, barAccount, barra, InMemoryStore, makeDeps, people } from './in-memory';

/** Descuento en la barra por membresía activa (SPEC-CAFETERIA D13). */

let store: InMemoryStore;
let ctx: ReturnType<typeof makeDeps>;
let seq = 0;

beforeEach(() => {
  store = new InMemoryStore({
    categories: sampleCategories.map((c) => (c.id === 'bebidas' ? { ...c, courtesyEligible: true } : c)),
    products: structuredClone(sampleProducts),
    users: people,
    barAccount,
    memberDiscounts: { 'client-1': { percent: 10, label: 'Lab Progress 10%' }, 'coach-1': { percent: 10, label: 'Open Lab 10%' } },
  });
  ctx = makeDeps(store);
});

const sell = (userId: string | null, items: { productId: string; quantity: number; courtesy: boolean }[], paymentMethod: 'cash' | 'transfer' | null = 'cash') => {
  seq += 1;
  return createOrder(ctx.deps, barra, {
    requestId: `40000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    customer: userId ? { type: 'user', userId } : { type: 'none' },
    items,
    paymentMethod,
  });
};

describe('createOrder con membresía', () => {
  it('aplica el % de la membresía activa y guarda subtotal, descuento y etiqueta', async () => {
    const result = await sell('client-1', [{ productId: 'latte-hot', quantity: 2, courtesy: false }, { productId: 'brownie', quantity: 1, courtesy: false }]);
    expect(result).toMatchObject({ totalCents: 17500 - 1750, discountCents: 1750 });
    expect(store.state.orders[0]).toMatchObject({ subtotalCents: 17500, discountCents: 1750, discountPercent: 10, discountLabel: 'Lab Progress 10%', totalCents: 15750 });
    // Las líneas guardan su precio completo; el descuento es del pedido.
    expect(store.state.items.map((i) => i.lineTotalCents)).toEqual([13000, 4500]);
  });

  it('sin membresía con descuento, o sin cliente registrado, no hay descuento', async () => {
    await sell('coach-2', [{ productId: 'latte-hot', quantity: 1, courtesy: false }]);
    await sell(null, [{ productId: 'latte-hot', quantity: 1, courtesy: false }]);
    expect(store.state.orders.map((o) => [o.totalCents, o.discountCents, o.discountLabel])).toEqual([
      [6500, 0, null],
      [6500, 0, null],
    ]);
  });

  it('las cortesías siguen en $0 y el descuento solo va sobre lo que se cobra', async () => {
    await sell('coach-1', [{ productId: 'latte-hot', quantity: 1, courtesy: true }, { productId: 'brownie', quantity: 1, courtesy: false }]);
    expect(store.state.orders[0]).toMatchObject({ subtotalCents: 4500, discountCents: 450, totalCents: 4050 });
  });

  it('un pedido 100 % cortesía no lleva descuento ni método', async () => {
    await sell('coach-1', [{ productId: 'latte-hot', quantity: 1, courtesy: true }], null);
    expect(store.state.orders[0]).toMatchObject({ subtotalCents: 0, discountCents: 0, discountPercent: 0, discountLabel: null, paymentMethod: null });
  });
});

describe('búsqueda, ventas y corte', () => {
  it('la búsqueda devuelve el descuento del cliente', async () => {
    const [ana] = await searchCustomers(ctx.deps, barra, { q: 'Ana' });
    expect(ana.discount).toEqual({ percent: 10, label: 'Lab Progress 10%' });
    const [diego] = await searchCustomers(ctx.deps, barra, { q: 'Diego' });
    expect(diego.discount).toBeNull();
  });

  it('ventas y corte cuentan el efectivo ya con descuento y suman los descuentos aparte', async () => {
    await sell('client-1', [{ productId: 'latte-hot', quantity: 2, courtesy: false }]); // 13000 − 1300
    await sell(null, [{ productId: 'brownie', quantity: 1, courtesy: false }]); // 4500
    const report = await getSalesReport(ctx.deps, admin, { from: '2026-10-15', to: '2026-10-15' });
    expect(report.totals).toMatchObject({ cashTotalCents: 11700 + 4500, totalCents: 16200, discountCents: 1300 });
    expect(report.orders.find((o) => o.folio === 1)).toMatchObject({ discountCents: 1300, discountLabel: 'Lab Progress 10%' });

    await createClosing(ctx.deps, barra, { cashDeliveredCents: 16200, expectedOrdersCount: 2, expectedCashTotalCents: 16200 });
    expect(ctx.notifier.calls[0].data.discountCents).toBe(1300);
    expect((await getPendingClosings(ctx.deps, admin))[0].discountCents).toBe(1300);
  });
});
