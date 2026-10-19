import { describe, it, expect, beforeEach } from 'vitest';
import { CafeteriaError } from '../../domain/errors';
import { sampleCategories, sampleProducts } from '../../domain/__tests__/fixtures';
import { createOrder } from '../use-cases/create-order';
import { grantCourtesy } from '../use-cases/courtesies';
import { getSalesReport } from '../use-cases/sales';
import { voidOrder } from '../use-cases/void-order';
import { admin, barAccount, barra, InMemoryStore, makeDeps, people } from './in-memory';

/** Reporte de ventas (SPEC-CAFETERIA A5, TASK-CF-APP-06). */

let store: InMemoryStore;
let ctx: ReturnType<typeof makeDeps>;
let seq = 0;

async function sell(at: string, items: { productId: string; quantity?: number; courtesy?: boolean }[], paymentMethod: 'cash' | 'transfer' | null, customer?: string) {
  ctx.clock.set(at);
  seq += 1;
  return createOrder(ctx.deps, barra, {
    requestId: `30000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    customer: customer ? { type: 'user', userId: customer } : { type: 'name', name: 'Mesa 1' },
    items: items.map((i) => ({ productId: i.productId, quantity: i.quantity ?? 1, courtesy: i.courtesy ?? false })),
    paymentMethod,
  });
}

beforeEach(async () => {
  store = new InMemoryStore({
    categories: sampleCategories.map((c) => (c.id === 'bebidas' ? { ...c, courtesyEligible: true } : c)),
    products: structuredClone(sampleProducts),
    users: people,
    barAccount,
  });
  ctx = makeDeps(store);
  await grantCourtesy(ctx.deps, admin, { userId: 'coach-1', quantity: 1, scope: { type: 'category', categoryId: 'comida' } });
  await sell('2026-10-14T23:59:59.999-06:00', [{ productId: 'latte-hot' }], 'cash'); // ayer
  await sell('2026-10-15T00:00:00.000-06:00', [{ productId: 'latte-hot', quantity: 2 }], 'cash'); // 13000
  await sell('2026-10-15T12:00:00.000-06:00', [{ productId: 'brownie' }], 'transfer'); // 4500
  await sell('2026-10-15T13:00:00.000-06:00', [{ productId: 'latte-hot', courtesy: true }, { productId: 'brownie', courtesy: true }], null, 'coach-1');
  await sell('2026-10-15T23:59:59.999-06:00', [{ productId: 'americano' }], 'cash'); // 4250, se anula
  await voidOrder(ctx.deps, admin, { orderId: store.state.orders[4].id, reason: 'Error' });
  await sell('2026-10-16T00:00:00.000-06:00', [{ productId: 'agua' }], 'cash'); // mañana
});

const today = { from: '2026-10-15', to: '2026-10-15' };

describe('getSalesReport', () => {
  it('el rango es por días CDMX (00:00 a 23:59:59.999)', async () => {
    const report = await getSalesReport(ctx.deps, admin, today);
    expect(report.orders.map((o) => o.folio).sort()).toEqual([2, 3, 4, 5]);
  });

  it('totales sin anulados; cortesías separadas por fuente', async () => {
    const { totals } = await getSalesReport(ctx.deps, admin, today);
    expect(totals).toEqual({
      ordersCount: 3, cashTotalCents: 13000, transferTotalCents: 4500, totalCents: 17500,
      courtesyItems: 2, courtesyMonthly: 1, courtesyGrant: 1, courtesyValueCents: 6500 + 4500, discountCents: 0, voidedCount: 1,
    });
  });

  it('desglose padre › subcategoría › producto con las copias del pedido', async () => {
    store.state.products.find((p) => p.id === 'latte-hot')!.name = 'Latte renombrado';
    const { breakdown } = await getSalesReport(ctx.deps, admin, today);
    expect(breakdown.map((r) => [r.group, r.productName, r.soldQuantity, r.revenueCents, r.courtesyMonthly, r.courtesyGrant])).toEqual([
      ['Bebidas › Café', 'Latte', 2, 13000, 1, 0],
      ['Comida › Postres', 'Brownie', 1, 4500, 0, 1],
    ]);
  });

  it('filtros por método, cortesía, estado y búsqueda', async () => {
    const folios = async (input: Partial<Parameters<typeof getSalesReport>[2]>) => (await getSalesReport(ctx.deps, admin, { ...today, ...input })).orders.map((o) => o.folio).sort();
    expect(await folios({ method: 'cash' })).toEqual([2, 5]);
    expect(await folios({ method: 'transfer' })).toEqual([3]);
    expect(await folios({ method: 'courtesy' })).toEqual([4]);
    expect(await folios({ status: 'voided' })).toEqual([5]);
    expect(await folios({ q: '#3' })).toEqual([3]);
    expect(await folios({ q: 'carla' })).toEqual([4]);
    expect(await folios({ q: 'brownie' })).toEqual([3, 4]);
    expect(await folios({ q: 'mesa' })).toEqual([2, 3, 5]);
  });

  it('cada cortesía indica su fuente', async () => {
    const report = await getSalesReport(ctx.deps, admin, { ...today, method: 'courtesy' });
    expect(report.orders[0].lines.map((l) => [l.productName, l.courtesySource])).toEqual([['Latte', 'monthly'], ['Brownie', 'grant']]);
    expect(report.orders[0].customerLabel).toBe('Carla Coach');
  });

  it('valida fechas y permisos', async () => {
    const field = async (input: { from: string; to: string }) => {
      try {
        await getSalesReport(ctx.deps, admin, input);
      } catch (e) {
        return (e as CafeteriaError).field;
      }
    };
    expect(await field({ from: '2026-13-01', to: '2026-10-15' })).toBe('from');
    expect(await field({ from: '2026-10-15', to: '2026-10-14' })).toBe('to');
    expect(await field({ from: '2025-01-01', to: '2026-10-15' })).toBe('to');
    await expect(getSalesReport(ctx.deps, barra, today)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
