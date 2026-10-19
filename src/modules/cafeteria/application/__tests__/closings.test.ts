import { describe, it, expect, beforeEach } from 'vitest';
import { CafeteriaError } from '../../domain/errors';
import { sampleCategories, sampleProducts } from '../../domain/__tests__/fixtures';
import { createOrder } from '../use-cases/create-order';
import { createClosing, getOpenShift, getPendingClosings, resolveClosing, retryClosingEmail } from '../use-cases/closings';
import { voidOrder } from '../use-cases/void-order';
import { admin, barAccount, barra, coachActor, InMemoryStore, makeDeps, people } from './in-memory';

/** Corte de caja (SPEC-CAFETERIA D6, A2–A4, TASK-CF-APP-02, TASK-CF-APP-03). */

let store: InMemoryStore;
let ctx: ReturnType<typeof makeDeps>;
let seq = 0;

async function sell(productId: string, quantity: number, paymentMethod: 'cash' | 'transfer' | null, courtesy = false, userId?: string) {
  seq += 1;
  return createOrder(ctx.deps, barra, {
    requestId: `10000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    customer: userId ? { type: 'user', userId } : { type: 'none' },
    items: [{ productId, quantity, courtesy }],
    paymentMethod,
  });
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

beforeEach(async () => {
  store = new InMemoryStore({
    categories: sampleCategories.map((c) => (c.id === 'bebidas' ? { ...c, courtesyEligible: true } : c)),
    products: structuredClone(sampleProducts),
    users: people,
    barAccount,
  });
  ctx = makeDeps(store);
  await sell('latte-hot', 2, 'cash'); // 130.00
  await sell('brownie', 1, 'transfer'); // 45.00
  await sell('latte-hot', 1, null, true, 'coach-1'); // cortesía 65.00
});

describe('turno abierto', () => {
  it('pedidos sin corte y totales por método; transferencias aparte; cortesías no suman', async () => {
    const shift = await getOpenShift(ctx.deps, barra);
    expect(shift.orders.map((o) => o.folio)).toEqual([1, 2, 3]);
    expect(shift.orders[2]).toMatchObject({ customerLabel: 'Carla Coach', courtesyItems: 1, itemsLabel: 'Latte' });
    expect(shift.totals).toMatchObject({ ordersCount: 3, cashTotalCents: 13000, transferTotalCents: 4500, transferOrdersCount: 1, courtesyItemsCount: 1, courtesyValueCents: 6500 });
    expect(shift.pendingClosings).toBe(0);
  });

  it('coach no lo ve', async () => {
    expect((await rejection(getOpenShift(ctx.deps, coachActor))).code).toBe('FORBIDDEN');
  });
});

describe('createClosing', () => {
  const expected = { expectedOrdersCount: 3, expectedCashTotalCents: 13000 };

  it('marca solo los pedidos que bloqueó, guarda totales y queda pending; envía el correo 1', async () => {
    const { closing, emailSent } = await createClosing(ctx.deps, barra, { cashDeliveredCents: 13000, ...expected });
    expect(closing).toMatchObject({ status: 'pending', ordersCount: 3, cashTotalCents: 13000, transferTotalCents: 4500, cashDeliveredCents: 13000, deliveryNote: null, createdBy: 'barra-1' });
    expect(store.state.orders.every((o) => o.closingId === closing.id)).toBe(true);
    expect(emailSent).toBe(true);
    expect(ctx.notifier.calls).toHaveLength(1);
    expect(ctx.notifier.calls[0].data).toMatchObject({ recipients: ['thelabpilates77@gmail.com'], createdByName: 'Beto Barra', transfers: [{ folio: 2, totalCents: 4500 }] });
    expect(store.state.closings[0].createdEmailStatus).toBe('sent');
  });

  it('entregar menos exige nota (A3); más de lo cobrado → error', async () => {
    expect((await rejection(createClosing(ctx.deps, barra, { cashDeliveredCents: 12000, ...expected }))).field).toBe('deliveryNote');
    expect((await rejection(createClosing(ctx.deps, barra, { cashDeliveredCents: 13001, ...expected }))).field).toBe('cashDelivered');
    const { closing } = await createClosing(ctx.deps, barra, { cashDeliveredCents: 12000, deliveryNote: 'Pagué hielo', ...expected });
    expect(closing.deliveryNote).toBe('Pagué hielo');
  });

  it('sin pedidos pendientes → error; dos cortes simultáneos no duplican', async () => {
    const [a, b] = await Promise.allSettled([
      createClosing(ctx.deps, barra, { cashDeliveredCents: 13000, ...expected }),
      createClosing(ctx.deps, barra, { cashDeliveredCents: 13000, ...expected }),
    ]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    const failed = (a.status === 'rejected' ? a : b) as PromiseRejectedResult;
    expect(failed.reason.code).toBe('NO_OPEN_ORDERS');
    expect(store.state.closings).toHaveLength(1);
  });

  it('si el turno cambió desde que la barra lo vio → «Cambió el turno»', async () => {
    await sell('americano', 1, 'cash');
    const e = await rejection(createClosing(ctx.deps, barra, { cashDeliveredCents: 13000, ...expected }));
    expect(e).toMatchObject({ code: 'SHIFT_CHANGED', message: 'Cambió el turno, revisa los totales.' });
    expect(store.state.closings).toHaveLength(0);
  });

  it('un corte pendiente no bloquea pedidos nuevos (A4): entran al siguiente', async () => {
    await createClosing(ctx.deps, barra, { cashDeliveredCents: 13000, ...expected });
    await sell('americano', 1, 'cash');
    const shift = await getOpenShift(ctx.deps, barra);
    expect(shift.orders.map((o) => o.folio)).toEqual([4]);
    expect(shift.pendingClosings).toBe(1);
  });

  it('si el correo falla, el corte queda válido con estado failed y se puede reintentar', async () => {
    ctx.notifier.result = false;
    const { closing, emailSent } = await createClosing(ctx.deps, barra, { cashDeliveredCents: 13000, ...expected });
    expect(emailSent).toBe(false);
    expect(store.state.closings[0]).toMatchObject({ status: 'pending', createdEmailStatus: 'failed' });
    ctx.notifier.result = true;
    expect(await retryClosingEmail(ctx.deps, admin, { closingId: closing.id, which: 'created' })).toEqual({ emailSent: true });
    expect(store.state.closings[0].createdEmailStatus).toBe('sent');
    expect((await rejection(retryClosingEmail(ctx.deps, barra, { closingId: closing.id, which: 'created' }))).code).toBe('FORBIDDEN');
  });

  it('coach no puede hacer cortes', async () => {
    expect((await rejection(createClosing(ctx.deps, coachActor, { cashDeliveredCents: 13000, ...expected }))).code).toBe('FORBIDDEN');
  });
});

describe('resolveClosing', () => {
  let closingId: string;
  beforeEach(async () => {
    closingId = (await createClosing(ctx.deps, barra, { cashDeliveredCents: 13000, expectedOrdersCount: 3, expectedCashTotalCents: 13000 })).closing.id;
  });

  it('solo admin', async () => {
    expect((await rejection(resolveClosing(ctx.deps, barra, { closingId, outcome: 'received_all' }))).code).toBe('FORBIDDEN');
  });

  it('completo → approved, con el correo 2', async () => {
    const { closing } = await resolveClosing(ctx.deps, admin, { closingId, outcome: 'received_all' });
    expect(closing).toMatchObject({ status: 'approved', cashReceivedCents: 13000, shortfallCents: 0, resolvedBy: 'admin-1', resolvedEmailStatus: 'sent' });
    expect(ctx.notifier.calls.map((c) => c.kind)).toEqual(['created', 'resolved']);
    expect(ctx.notifier.calls[1].data.resolvedByName).toBe('Admin');
  });

  it('parcial → approved_with_shortfall con faltante', async () => {
    const { closing } = await resolveClosing(ctx.deps, admin, { closingId, outcome: 'received_partial', cashReceivedCents: 12500, note: 'Faltaron $5' });
    expect(closing).toMatchObject({ status: 'approved_with_shortfall', cashReceivedCents: 12500, shortfallCents: 500, resolutionNote: 'Faltaron $5' });
  });

  it('un corte ya resuelto → «Este corte ya fue resuelto»', async () => {
    await resolveClosing(ctx.deps, admin, { closingId, outcome: 'received_all' });
    const e = await rejection(resolveClosing(ctx.deps, admin, { closingId, outcome: 'received_all' }));
    expect(e).toMatchObject({ code: 'ALREADY_RESOLVED', message: 'Este corte ya fue resuelto.' });
  });

  it('getPendingClosings da el detalle para el modal', async () => {
    const [pending] = await getPendingClosings(ctx.deps, admin);
    expect(pending).toMatchObject({ id: closingId, createdByName: 'Beto Barra', transfers: [{ folio: 2 }] });
    expect(pending.breakdown.map((r) => r.productName)).toEqual(['Latte', 'Brownie']);
    await resolveClosing(ctx.deps, admin, { closingId, outcome: 'received_all' });
    expect(await getPendingClosings(ctx.deps, admin)).toEqual([]);
  });
});

describe('voidOrder (D8)', () => {
  it('solo admin y con motivo', async () => {
    const orderId = store.state.orders[0].id;
    expect((await rejection(voidOrder(ctx.deps, barra, { orderId, reason: 'x' }))).code).toBe('FORBIDDEN');
    expect((await rejection(voidOrder(ctx.deps, admin, { orderId, reason: '  ' }))).field).toBe('reason');
  });

  it('anula, sale de los totales y no se anula dos veces', async () => {
    const orderId = store.state.orders[0].id;
    await voidOrder(ctx.deps, admin, { orderId, reason: 'Cobro duplicado' });
    expect(store.state.orders[0]).toMatchObject({ status: 'voided', voidedBy: 'admin-1', voidReason: 'Cobro duplicado' });
    expect((await getOpenShift(ctx.deps, barra)).totals.cashTotalCents).toBe(0);
    expect((await rejection(voidOrder(ctx.deps, admin, { orderId, reason: 'otra vez' }))).code).toBe('ALREADY_VOIDED');
  });

  it('un pedido con corte no se anula', async () => {
    await createClosing(ctx.deps, barra, { cashDeliveredCents: 13000, expectedOrdersCount: 3, expectedCashTotalCents: 13000 });
    const e = await rejection(voidOrder(ctx.deps, admin, { orderId: store.state.orders[0].id, reason: 'tarde' }));
    expect(e.code).toBe('ORDER_CLOSED');
  });
});
