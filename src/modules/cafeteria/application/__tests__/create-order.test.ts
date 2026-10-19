import { describe, it, expect, beforeEach } from 'vitest';
import { CafeteriaError } from '../../domain/errors';
import type { GrantRow } from '../ports';
import { createOrder, type CreateOrderInput } from '../use-cases/create-order';
import { voidOrder } from '../use-cases/void-order';
import { sampleCategories, sampleProducts } from '../../domain/__tests__/fixtures';
import { admin, barAccount, barra, clientActor, coachActor, InMemoryStore, makeDeps, people } from './in-memory';

/** Cobro en la barra (SPEC-CAFETERIA §4.3, §5, TASK-CF-APP-01). */

let store: InMemoryStore;
let deps: ReturnType<typeof makeDeps>['deps'];
let seq = 0;

/** Bebidas elegibles para el cupo mensual (D3). */
function setup(overrides: { grants?: GrantRow[]; barAccount?: boolean } = {}) {
  store = new InMemoryStore({
    categories: sampleCategories.map((c) => (c.id === 'bebidas' ? { ...c, courtesyEligible: true } : c)),
    products: structuredClone(sampleProducts),
    users: people,
    barAccount: overrides.barAccount === false ? null : barAccount,
    grants: overrides.grants ?? [],
  });
  deps = makeDeps(store).deps;
}

function order(partial: Partial<CreateOrderInput> = {}): CreateOrderInput {
  seq += 1;
  return {
    requestId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    customer: { type: 'none' },
    items: [{ productId: 'latte-hot', quantity: 1, courtesy: false }],
    paymentMethod: 'cash',
    ...partial,
  };
}

function grant(overrides: Partial<GrantRow>): GrantRow {
  return {
    id: 'g1', userId: 'client-1', grantedBy: 'admin-1', quantity: 1, scope: { type: 'any' }, scopeLabel: 'Cualquier artículo', note: null,
    expiresAt: null, revokedAt: null, revokedBy: null, revokeReason: null, createdAt: new Date('2026-10-01T12:00:00Z'), ...overrides,
  };
}

async function rejection(promise: Promise<unknown>): Promise<CafeteriaError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CafeteriaError) return error;
    throw error;
  }
  throw new Error('no rechazó');
}

beforeEach(() => setup());

describe('permisos', () => {
  it.each([coachActor, clientActor, null])('%o no puede cobrar y no toca la BD', async (actor) => {
    expect((await rejection(createOrder(deps, actor, order()))).code).toBe('FORBIDDEN');
    expect(store.state.orders).toHaveLength(0);
  });
});

describe('precios y productos', () => {
  it('recalcula precios desde el menú y guarda las copias', async () => {
    const result = await createOrder(deps, barra, order({ items: [{ productId: 'latte-hot', quantity: 2, courtesy: false }, { productId: 'brownie', quantity: 1, courtesy: false }] }));
    expect(result).toMatchObject({ totalCents: 6500 * 2 + 4500, folio: 1, duplicate: false, courtesyApplied: 0 });
    expect(store.state.orders[0]).toMatchObject({ createdBy: 'barra-1', paymentMethod: 'cash', bankAccountId: null, status: 'paid', closingId: null });
    expect(store.state.items[1]).toMatchObject({ productName: 'Brownie', categoryName: 'Postres', parentCategoryName: 'Comida', temperature: null, lineTotalCents: 4500 });
  });

  it.each([
    ['inactivo', { isActive: false }],
    ['eliminado', { deletedAt: new Date() }],
    ['agotado', { isAvailable: false }],
  ])('producto %s → error', async (_label, patch) => {
    Object.assign(store.state.products.find((p) => p.id === 'latte-hot')!, patch);
    expect((await rejection(createOrder(deps, barra, order()))).code).toBe('PRODUCT_UNAVAILABLE');
  });

  it('producto de una categoría desactivada o inexistente → error', async () => {
    store.state.categories.find((c) => c.id === 'bebidas')!.isActive = false;
    expect((await rejection(createOrder(deps, barra, order()))).code).toBe('PRODUCT_UNAVAILABLE');
    expect((await rejection(createOrder(deps, barra, order({ items: [{ productId: 'nope', quantity: 1, courtesy: false }] })))).code).toBe('PRODUCT_UNAVAILABLE');
  });
});

describe('idempotencia', () => {
  it('el mismo requestId dos veces crea un pedido y devuelve el mismo folio', async () => {
    const input = order();
    const first = await createOrder(deps, barra, input);
    const second = await createOrder(deps, barra, input);
    expect(second).toEqual({ ...first, duplicate: true });
    expect(store.state.orders).toHaveLength(1);
  });
});

describe('transferencia', () => {
  it('sin cuenta de barra → error claro', async () => {
    setup({ barAccount: false });
    const e = await rejection(createOrder(deps, barra, order({ paymentMethod: 'transfer' })));
    expect(e).toMatchObject({ code: 'NO_BAR_ACCOUNT', message: 'No hay cuenta bancaria marcada para la barra.' });
  });

  it('con cuenta guarda bank_account_id', async () => {
    await createOrder(deps, admin, order({ paymentMethod: 'transfer' }));
    expect(store.state.orders[0]).toMatchObject({ paymentMethod: 'transfer', bankAccountId: 'card-bar', createdBy: 'admin-1' });
  });

  it('total > 0 sin método → error', async () => {
    expect((await rejection(createOrder(deps, barra, order({ paymentMethod: null })))).field).toBe('paymentMethod');
  });
});

describe('cliente', () => {
  it('nombre libre o usuario registrado', async () => {
    await createOrder(deps, barra, order({ customer: { type: 'name', name: '  Mesa 3 ' } }));
    await createOrder(deps, barra, order({ customer: { type: 'user', userId: 'client-1' } }));
    expect(store.state.orders.map((o) => [o.customerName, o.customerUserId])).toEqual([['Mesa 3', null], [null, 'client-1']]);
  });

  it('usuario inexistente o eliminado → error', async () => {
    expect((await rejection(createOrder(deps, barra, order({ customer: { type: 'user', userId: 'nope' } })))).code).toBe('NOT_FOUND');
    expect((await rejection(createOrder(deps, barra, order({ customer: { type: 'user', userId: 'gone-1' } })))).code).toBe('NOT_FOUND');
  });
});

describe('rollback', () => {
  it('un pedido que falla a mitad no deja nada guardado', async () => {
    store.failOn = 'orders.insert';
    await expect(createOrder(deps, barra, order())).rejects.toThrow('fallo simulado');
    expect(store.state.orders).toHaveLength(0);
    expect(store.state.items).toHaveLength(0);
  });
});

describe('cupo mensual de coach', () => {
  const coachOrder = (courtesies: number, extra = 0) =>
    order({
      customer: { type: 'user', userId: 'coach-1' },
      items: [
        ...Array.from({ length: courtesies }, () => ({ productId: 'latte-hot', quantity: 1, courtesy: true })),
        ...(extra ? [{ productId: 'brownie', quantity: extra, courtesy: false }] : []),
      ],
      paymentMethod: extra ? 'cash' : null,
    });

  it('aplica la cortesía con fuente mensual y periodo CDMX; 100 % cortesía sin método', async () => {
    const result = await createOrder(deps, barra, coachOrder(1));
    expect(result).toMatchObject({ totalCents: 0, courtesyApplied: 1 });
    expect(store.state.orders[0].paymentMethod).toBeNull();
    expect(store.state.items[0]).toMatchObject({ isCourtesy: true, courtesySource: 'monthly', courtesyPeriod: '2026-10', courtesyGrantId: null, courtesyUserId: 'coach-1', lineTotalCents: 0 });
  });

  it('la quinta del mes se rechaza con motivo; anular devuelve el crédito', async () => {
    await createOrder(deps, barra, coachOrder(4));
    const e = await rejection(createOrder(deps, barra, coachOrder(1)));
    expect(e).toMatchObject({ code: 'COURTESY_NOT_ALLOWED', message: 'Sin cortesía disponible para: Latte.' });
    await voidOrder(deps, admin, { orderId: store.state.orders[0].id, reason: 'Error de captura' });
    await expect(createOrder(deps, barra, coachOrder(1))).resolves.toMatchObject({ courtesyApplied: 1 });
  });

  it('un artículo no elegible (comida) no recibe cupo mensual', async () => {
    const e = await rejection(createOrder(deps, barra, order({ customer: { type: 'user', userId: 'coach-1' }, items: [{ productId: 'brownie', quantity: 1, courtesy: true }], paymentMethod: null })));
    expect(e.code).toBe('COURTESY_NOT_ALLOWED');
  });

  it('cortesía sin cliente registrado → error', async () => {
    const e = await rejection(createOrder(deps, barra, order({ items: [{ productId: 'latte-hot', quantity: 1, courtesy: true }], paymentMethod: null })));
    expect(e).toMatchObject({ code: 'COURTESY_NOT_ALLOWED', field: 'customer' });
  });

  it('un cliente que no es coach no tiene cupo mensual', async () => {
    const e = await rejection(createOrder(deps, barra, order({ customer: { type: 'user', userId: 'client-1' }, items: [{ productId: 'latte-hot', quantity: 1, courtesy: true }], paymentMethod: null })));
    expect(e.code).toBe('COURTESY_NOT_ALLOWED');
  });

  it('concurrencia: saldo 1 y dos pedidos simultáneos → solo uno obtiene la cortesía', async () => {
    store.state.settings.coachMonthlyCourtesy = 1;
    const results = await Promise.allSettled([createOrder(deps, barra, coachOrder(1)), createOrder(deps, barra, coachOrder(1))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(store.state.items.filter((i) => i.isCourtesy)).toHaveLength(1);
    expect(store.lockLog.filter((k) => k === 'bar-courtesy:coach-1')).toHaveLength(2);
  });
});

describe('regalos del admin (D11)', () => {
  it('un cliente con un regalo que cubre el artículo → cortesía con fuente grant', async () => {
    setup({ grants: [grant({ id: 'g-postres', scope: { type: 'category', categoryId: 'comida' }, scopeLabel: 'Comida' })] });
    await createOrder(deps, barra, order({ customer: { type: 'user', userId: 'client-1' }, items: [{ productId: 'brownie', quantity: 1, courtesy: true }], paymentMethod: null }));
    expect(store.state.items[0]).toMatchObject({ courtesySource: 'grant', courtesyGrantId: 'g-postres', courtesyPeriod: null });
  });

  it('un regalo de Comida no cubre un café', async () => {
    setup({ grants: [grant({ scope: { type: 'category', categoryId: 'comida' } })] });
    const e = await rejection(createOrder(deps, barra, order({ customer: { type: 'user', userId: 'client-1' }, items: [{ productId: 'latte-hot', quantity: 1, courtesy: true }], paymentMethod: null })));
    expect(e.code).toBe('COURTESY_NOT_ALLOWED');
  });

  it.each([
    ['vencido', { expiresAt: new Date('2026-10-14T23:59:59.999-06:00') }],
    ['revocado', { revokedAt: new Date('2026-10-10'), revokedBy: 'admin-1', revokeReason: 'x' }],
    ['de otro producto', { scope: { type: 'product' as const, productId: 'brownie' } }],
  ])('regalo %s → rechazo', async (_label, patch) => {
    setup({ grants: [grant(patch)] });
    const e = await rejection(createOrder(deps, barra, order({ customer: { type: 'user', userId: 'client-1' }, items: [{ productId: 'panini', quantity: 1, courtesy: true }], paymentMethod: null })));
    expect(e.code).toBe('COURTESY_NOT_ALLOWED');
  });

  it('un regalo agotado no se canjea; anular el pedido lo devuelve', async () => {
    setup({ grants: [grant({ quantity: 1 })] });
    const input = () => order({ customer: { type: 'user', userId: 'client-1' }, items: [{ productId: 'panini', quantity: 1, courtesy: true }], paymentMethod: null });
    await createOrder(deps, barra, input());
    expect((await rejection(createOrder(deps, barra, input()))).code).toBe('COURTESY_NOT_ALLOWED');
    await voidOrder(deps, admin, { orderId: store.state.orders[0].id, reason: 'Se equivocó' });
    await expect(createOrder(deps, barra, input())).resolves.toMatchObject({ courtesyApplied: 1 });
  });

  it('coach con cupo mensual y un regalo en el mismo pedido: cada línea guarda su fuente', async () => {
    setup({ grants: [grant({ id: 'g-coach', userId: 'coach-1', scope: { type: 'category', categoryId: 'comida' } })] });
    await createOrder(deps, barra, order({
      customer: { type: 'user', userId: 'coach-1' },
      items: [{ productId: 'latte-hot', quantity: 1, courtesy: true }, { productId: 'brownie', quantity: 1, courtesy: true }],
      paymentMethod: null,
    }));
    expect(store.state.items.map((i) => [i.productName, i.courtesySource, i.courtesyGrantId])).toEqual([
      ['Latte', 'monthly', null],
      ['Brownie', 'grant', 'g-coach'],
    ]);
  });

  it('concurrencia: 1 regalo restante y dos pedidos simultáneos → solo uno lo obtiene', async () => {
    setup({ grants: [grant({ quantity: 1 })] });
    const input = () => order({ customer: { type: 'user', userId: 'client-1' }, items: [{ productId: 'panini', quantity: 1, courtesy: true }], paymentMethod: null });
    const results = await Promise.allSettled([createOrder(deps, barra, input()), createOrder(deps, barra, input())]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(store.state.items.filter((i) => i.courtesyGrantId === 'g1')).toHaveLength(1);
  });
});
