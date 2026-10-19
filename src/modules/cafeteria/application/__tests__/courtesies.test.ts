import { describe, it, expect, beforeEach } from 'vitest';
import { CafeteriaError } from '../../domain/errors';
import { sampleCategories, sampleProducts } from '../../domain/__tests__/fixtures';
import { createOrder } from '../use-cases/create-order';
import {
  getMyCourtesies,
  grantCourtesy,
  listCourtesyGrants,
  revokeCourtesy,
  searchCustomers,
  updateCourtesyRules,
} from '../use-cases/courtesies';
import { voidOrder } from '../use-cases/void-order';
import { admin, barAccount, barra, clientActor, coachActor, InMemoryStore, makeDeps, people } from './in-memory';

/** Reglas, regalos, «Mis cortesías» y búsqueda (D3, D11, D12, TASK-CF-APP-04/05/07, CLI-01). */

let store: InMemoryStore;
let ctx: ReturnType<typeof makeDeps>;
let seq = 0;

beforeEach(() => {
  store = new InMemoryStore({
    categories: sampleCategories.map((c) => (c.id === 'bebidas' ? { ...c, courtesyEligible: true } : c)),
    products: structuredClone(sampleProducts),
    users: people,
    barAccount,
  });
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

function redeem(userId: string, productId: string) {
  seq += 1;
  return createOrder(ctx.deps, barra, {
    requestId: `20000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    customer: { type: 'user', userId },
    items: [{ productId, quantity: 1, courtesy: true }],
    paymentMethod: null,
  });
}

describe('updateCourtesyRules (D3)', () => {
  const valid = { limit: 6, notifyEmails: ['thelabpilates77@gmail.com', ' Otro@Lab.mx '], categories: [{ id: 'comida', eligible: true }], products: [{ id: 'panini', override: false }] };

  it('guarda límite, correos normalizados y tri-estados en una transacción', async () => {
    await updateCourtesyRules(ctx.deps, admin, valid);
    expect(store.state.settings).toMatchObject({ coachMonthlyCourtesy: 6, closingNotifyEmails: ['thelabpilates77@gmail.com', 'otro@lab.mx'], updatedBy: 'admin-1' });
    expect(store.state.categories.find((c) => c.id === 'comida')?.courtesyEligible).toBe(true);
    expect(store.state.products.find((p) => p.id === 'panini')?.courtesyOverride).toBe(false);
  });

  it.each([
    [{ limit: 32 }, 'limit'],
    [{ limit: -1 }, 'limit'],
    [{ notifyEmails: [] }, 'notifyEmails'],
    [{ notifyEmails: ['no-es-correo'] }, 'notifyEmails'],
    [{ notifyEmails: ['a@b.mx', 'A@B.mx'] }, 'notifyEmails'],
  ])('rechaza %o', async (patch, field) => {
    expect((await rejection(updateCourtesyRules(ctx.deps, admin, { ...valid, ...patch }))).field).toBe(field);
  });

  it('un id inexistente → error y nada se guarda', async () => {
    const e = await rejection(updateCourtesyRules(ctx.deps, admin, { ...valid, products: [{ id: 'panini', override: false }, { id: 'nope', override: true }] }));
    expect(e.code).toBe('NOT_FOUND');
    expect(store.state.settings.coachMonthlyCourtesy).toBe(4);
    expect(store.state.products.find((p) => p.id === 'panini')?.courtesyOverride).toBeNull();
  });

  it('solo admin', async () => {
    expect((await rejection(updateCourtesyRules(ctx.deps, barra, valid))).code).toBe('FORBIDDEN');
  });
});

describe('grantCourtesy (D11)', () => {
  it('barra recibe el error de permisos antes de tocar la BD', async () => {
    expect((await rejection(grantCourtesy(ctx.deps, barra, { userId: 'client-1', quantity: 1, scope: { type: 'any' } }))).code).toBe('FORBIDDEN');
    expect(store.state.grants).toHaveLength(0);
  });

  it('guarda alcance legible, quién regaló y vencimiento al fin del día CDMX', async () => {
    const grant = await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 2, scope: { type: 'category', categoryId: 'postres' }, expiresOn: '2026-10-20', note: ' Cumpleaños ' });
    expect(grant).toMatchObject({ scopeLabel: 'Comida › Postres', grantedBy: 'admin-1', note: 'Cumpleaños', expiresAt: new Date('2026-10-20T23:59:59.999-06:00') });
    const product = await grantCourtesy(ctx.deps, admin, { userId: 'coach-1', quantity: 1, scope: { type: 'product', productId: 'latte-hot' } });
    expect(product.scopeLabel).toBe('Latte (caliente)');
  });

  it.each([
    [{ quantity: 0 }, 'quantity'],
    [{ quantity: 51 }, 'quantity'],
    [{ expiresOn: '2026-10-14' }, 'expiresOn'],
    [{ expiresOn: '2026-02-30' }, 'expiresOn'],
    [{ userId: 'gone-1' }, 'userId'],
    [{ scope: { type: 'category' as const, categoryId: 'nope' } }, 'scope'],
  ])('rechaza %o', async (patch, field) => {
    expect((await rejection(grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 1, scope: { type: 'any' }, ...patch }))).field).toBe(field);
  });

  it('una categoría inactiva no se puede regalar; regalar no invalida el caché', async () => {
    store.state.categories.find((c) => c.id === 'comida')!.isActive = false;
    expect((await rejection(grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 1, scope: { type: 'category', categoryId: 'postres' } }))).field).toBe('scope');
    await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 1, scope: { type: 'any' }, expiresOn: '2026-10-15' });
    expect(ctx.menuCache.invalidations).toBe(0);
  });
});

describe('revokeCourtesy y listCourtesyGrants', () => {
  it('motivo obligatorio; lo canjeado sigue contado; no se revoca dos veces', async () => {
    const grant = await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 3, scope: { type: 'any' } });
    await redeem('client-1', 'brownie');
    expect((await rejection(revokeCourtesy(ctx.deps, admin, { grantId: grant.id, reason: ' ' }))).field).toBe('reason');
    await revokeCourtesy(ctx.deps, admin, { grantId: grant.id, reason: 'Error' });
    const [listed] = await listCourtesyGrants(ctx.deps, admin);
    expect(listed).toMatchObject({ status: 'revoked', redeemed: 1, remaining: 2, userName: 'Ana Cliente', grantedByName: 'Admin', revokeReason: 'Error' });
    expect((await rejection(revokeCourtesy(ctx.deps, admin, { grantId: grant.id, reason: 'otra' }))).code).toBe('CONFLICT');
  });

  it('no se revoca un regalo agotado o vencido', async () => {
    const used = await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 1, scope: { type: 'any' } });
    await redeem('client-1', 'brownie');
    expect((await rejection(revokeCourtesy(ctx.deps, admin, { grantId: used.id, reason: 'x' }))).message).toBe('Este regalo ya se usó completo.');
    const expiring = await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 1, scope: { type: 'any' }, expiresOn: '2026-10-15' });
    ctx.clock.set('2026-10-16T09:00:00-06:00');
    expect((await rejection(revokeCourtesy(ctx.deps, admin, { grantId: expiring.id, reason: 'x' }))).message).toBe('Este regalo ya venció.');
  });

  it('estados calculados, filtro por estado y búsqueda por usuario', async () => {
    await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 1, scope: { type: 'product', productId: 'brownie' } });
    await grantCourtesy(ctx.deps, admin, { userId: 'coach-1', quantity: 2, scope: { type: 'any' } });
    store.state.products.find((p) => p.id === 'brownie')!.isActive = false;
    const all = await listCourtesyGrants(ctx.deps, admin);
    expect(all.map((g) => [g.userName, g.status]).sort()).toEqual([['Ana Cliente', 'unavailable'], ['Carla Coach', 'active']]);
    expect((await listCourtesyGrants(ctx.deps, admin, { status: 'active' })).map((g) => g.userName)).toEqual(['Carla Coach']);
    expect((await listCourtesyGrants(ctx.deps, admin, { userQuery: 'ana@' })).map((g) => g.userName)).toEqual(['Ana Cliente']);
    expect(await listCourtesyGrants(ctx.deps, admin, { userQuery: 'zzz' })).toEqual([]);
    expect((await rejection(listCourtesyGrants(ctx.deps, barra))).code).toBe('FORBIDDEN');
  });
});

describe('getMyCourtesies (D12)', () => {
  it('solo las propias, vigentes, sin nota ni quién regaló; cupo mensual solo coach', async () => {
    await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 2, scope: { type: 'category', categoryId: 'postres' }, expiresOn: '2026-10-20', note: 'interno' });
    await grantCourtesy(ctx.deps, admin, { userId: 'coach-1', quantity: 1, scope: { type: 'any' } });
    const revoked = await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 1, scope: { type: 'any' } });
    await revokeCourtesy(ctx.deps, admin, { grantId: revoked.id, reason: 'x' });
    await redeem('client-1', 'brownie');

    const mine = await getMyCourtesies(ctx.deps, clientActor);
    expect(mine).toEqual({ monthly: null, grants: [{ id: expect.any(String), scopeLabel: 'Comida › Postres', remaining: 1, quantity: 2, expiresAt: new Date('2026-10-20T23:59:59.999-06:00') }] });
    expect(JSON.stringify(mine)).not.toContain('interno');

    await redeem('coach-1', 'latte-hot');
    const coach = await getMyCourtesies(ctx.deps, coachActor);
    expect(coach.monthly).toEqual({ remaining: 3, limit: 4 });
    expect(coach.grants).toHaveLength(1);
  });

  it('sin sesión → error', async () => {
    expect((await rejection(getMyCourtesies(ctx.deps, null))).code).toBe('FORBIDDEN');
  });
});

describe('searchCustomers', () => {
  it('menos de 2 caracteres → vacío; busca nombre o correo; excluye eliminados', async () => {
    expect(await searchCustomers(ctx.deps, barra, { q: 'a' })).toEqual([]);
    expect((await searchCustomers(ctx.deps, barra, { q: 'coach' })).map((u) => u.name)).toEqual(['Carla Coach', 'Diego Coach']);
    expect((await searchCustomers(ctx.deps, barra, { q: 'ana@correo' })).map((u) => u.name)).toEqual(['Ana Cliente']);
    expect(await searchCustomers(ctx.deps, barra, { q: 'gone' })).toEqual([]);
  });

  it('máximo 8 resultados', async () => {
    for (let i = 0; i < 12; i++) store.state.users.push({ id: `x${i}`, name: `Xime ${i}`, email: `x${i}@m.mx`, role: 'client', deletedAt: null });
    expect(await searchCustomers(ctx.deps, barra, { q: 'xime' })).toHaveLength(8);
  });

  it('solo id, nombre, correo, rol y cortesías; cupo mensual solo para coaches', async () => {
    await grantCourtesy(ctx.deps, admin, { userId: 'client-1', quantity: 2, scope: { type: 'any' } });
    await redeem('coach-1', 'latte-hot');
    const [ana] = await searchCustomers(ctx.deps, barra, { q: 'Ana' });
    expect(Object.keys(ana).sort()).toEqual(['courtesy', 'discount', 'email', 'id', 'name', 'role']);
    expect(ana.courtesy.monthly).toBeNull();
    expect(ana.courtesy.grants[0]).toMatchObject({ scopeLabel: 'Cualquier artículo', remaining: 2 });
    const [carla] = await searchCustomers(ctx.deps, barra, { q: 'Carla' });
    expect(carla.courtesy.monthly).toEqual({ used: 1, limit: 4, remaining: 3 });
  });

  it('anular devuelve el crédito al saldo mostrado', async () => {
    await redeem('coach-1', 'latte-hot');
    await voidOrder(ctx.deps, admin, { orderId: store.state.orders[0].id, reason: 'x' });
    const [carla] = await searchCustomers(ctx.deps, barra, { q: 'Carla' });
    expect(carla.courtesy.monthly?.remaining).toBe(4);
  });

  it('coach o cliente no pueden buscar', async () => {
    expect((await rejection(searchCustomers(ctx.deps, coachActor, { q: 'Ana' }))).code).toBe('FORBIDDEN');
  });
});
