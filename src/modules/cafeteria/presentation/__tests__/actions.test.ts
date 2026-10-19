// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, deps } = vi.hoisted(() => ({ getSession: vi.fn(), deps: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession }));
vi.mock('../../infrastructure/container', () => ({ cafeteriaDeps: deps }));

import * as menu from '../actions/menu';
import * as register from '../actions/register';
import * as admin from '../actions/admin';
import { customerSearchRateLimiter } from '@/lib/auth/rate-limiter';
import { productSchema, closingSchema } from '../schemas';

/** Server Actions (SPEC-CAFETERIA §2, §9, TASK-CF-INF-04). */

const session = (role: string | null) =>
  getSession.mockResolvedValue(role ? { sub: `${role}-uuid`, role, email: `${role}@x.mx`, iat: 0, exp: 0 } : null);

const ID = '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

beforeEach(() => {
  vi.clearAllMocks();
  customerSearchRateLimiter.reset('barra-uuid');
});

const adminOnly: [string, () => Promise<{ success: boolean; error?: string }>][] = [
  ['createCategoryAction', () => menu.createCategoryAction({})],
  ['updateCategoryAction', () => menu.updateCategoryAction(ID, {})],
  ['deleteCategoryAction', () => menu.deleteCategoryAction(ID)],
  ['createProductAction', () => menu.createProductAction({})],
  ['updateProductAction', () => menu.updateProductAction(ID, {})],
  ['deleteProductAction', () => menu.deleteProductAction(ID)],
  ['setProductAvailabilityAction', () => menu.setProductAvailabilityAction(ID, false)],
  ['getSalesReportAction', () => admin.getSalesReportAction({})],
  ['voidOrderAction', () => admin.voidOrderAction({})],
  ['resolveClosingAction', () => admin.resolveClosingAction({})],
  ['retryClosingEmailAction', () => admin.retryClosingEmailAction({})],
  ['updateCourtesyRulesAction', () => admin.updateCourtesyRulesAction({})],
  ['grantCourtesyAction', () => admin.grantCourtesyAction({})],
  ['revokeCourtesyAction', () => admin.revokeCourtesyAction({})],
  ['listCourtesyGrantsAction', () => admin.listCourtesyGrantsAction({})],
  ['searchUsersForGrantAction', () => admin.searchUsersForGrantAction('ana')],
];

const barOrAdmin: [string, () => Promise<{ success: boolean; error?: string }>][] = [
  ['createOrderAction', () => register.createOrderAction({})],
  ['searchCustomersAction', () => register.searchCustomersAction('ana')],
  ['createClosingAction', () => register.createClosingAction({})],
];

describe('permisos antes de tocar la BD', () => {
  it.each(adminOnly)('%s: sin sesión, client, coach y barra → rechazo', async (_name, call) => {
    for (const role of [null, 'client', 'coach', 'barra']) {
      session(role);
      expect(await call()).toEqual({ success: false, error: 'No tienes permisos para esta acción.' });
    }
    expect(deps).not.toHaveBeenCalled();
  });

  it.each(barOrAdmin)('%s: sin sesión, client y coach → rechazo', async (_name, call) => {
    for (const role of [null, 'client', 'coach']) {
      session(role);
      expect(await call()).toEqual({ success: false, error: 'No tienes permisos para esta acción.' });
    }
    expect(deps).not.toHaveBeenCalled();
  });
});

describe('validación', () => {
  it('una entrada inválida devuelve fieldErrors sin llamar al caso de uso', async () => {
    session('admin');
    const result = await menu.createProductAction({ categoryId: ID, name: '', price: '42.555', temperature: null, isActive: true, isAvailable: true });
    expect(result).toMatchObject({ success: false, fieldErrors: { name: 'Escribe el nombre.', price: 'Usa máximo 2 decimales.' } });
    expect(deps).not.toHaveBeenCalled();
  });

  it('los precios llegan como texto con centavos', () => {
    expect(productSchema.parse({ categoryId: ID, name: 'Latte', price: '42.50', temperature: 'hot', isActive: true, isAvailable: true }).price).toBe(4250);
    expect(productSchema.safeParse({ categoryId: ID, name: 'Latte', price: '0', temperature: 'hot', isActive: true, isAvailable: true }).success).toBe(false);
    expect(closingSchema.parse({ cashDelivered: '0', expectedOrdersCount: 1, expectedCashTotalCents: 0 }).cashDelivered).toBe(0);
    expect(closingSchema.parse({ cashDelivered: '12,500.00', expectedOrdersCount: 1, expectedCashTotalCents: 0 }).cashDelivered).toBe(1_250_000);
  });
});

describe('searchCustomersAction', () => {
  it('aplica 60 búsquedas por minuto por usuario', async () => {
    session('barra');
    deps.mockReturnValue({ uow: { read: async () => [] }, clock: {}, notifier: {}, menuCache: {} });
    for (let i = 0; i < 60; i++) await register.searchCustomersAction('a');
    expect(await register.searchCustomersAction('ana')).toEqual({ success: false, error: 'Demasiadas búsquedas. Espera un minuto.' });
  });
});
