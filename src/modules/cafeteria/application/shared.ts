import {
  indexCategories,
  isCategoryVisible,
  isProductSellable,
  isProductVisible,
  rootOf,
  type CategoryIndex,
  type CategoryRecord,
  type ProductRecord,
} from '../domain/category-tree';
import { effectiveCourtesyEligibility, monthlyCourtesyBalance } from '../domain/courtesy';
import {
  grantCovers,
  grantRemaining,
  grantStatus,
  specificityOf,
  type CourtesySource,
  type GrantStatus,
  type ItemPlacement,
} from '../domain/courtesy-grants';
import { CafeteriaError, invalid } from '../domain/errors';
import type { SellableProduct } from '../domain/order';
import type { Actor, ActorRole, CafeteriaTx, Clock, GrantWithUsage, UserSummary } from './ports';

/** Autorización de cada caso de uso (SPEC-CAFETERIA §2), antes de tocar la BD. */
export function requireRole(actor: Actor | null, roles: readonly ActorRole[]): Actor {
  if (!actor || !roles.includes(actor.role)) {
    throw new CafeteriaError('FORBIDDEN', 'No tienes permisos para esta acción.');
  }
  return actor;
}

export const BAR_ROLES: readonly ActorRole[] = ['barra', 'admin'];
export const ADMIN_ONLY: readonly ActorRole[] = ['admin'];

export const REASON_MAX = 500;

/** Texto obligatorio recortado (motivos de anulación y revocación). */
export function requiredText(value: string | null | undefined, message: string, field: string, max = REASON_MAX): string {
  const text = value?.trim() ?? '';
  if (text === '') throw invalid(message, field);
  if (text.length > max) throw invalid(`Máximo ${max} caracteres.`, field);
  return text;
}

export function optionalText(value: string | null | undefined, field: string, max = REASON_MAX): string | null {
  const text = value?.trim() ?? '';
  if (text.length > max) throw invalid(`Máximo ${max} caracteres.`, field);
  return text === '' ? null : text;
}

// ── Menú ─────────────────────────────────────────────────────────────────────

export interface MenuSnapshot {
  categories: CategoryRecord[];
  products: ProductRecord[];
  index: CategoryIndex;
}

export async function loadMenuSnapshot(tx: CafeteriaTx): Promise<MenuSnapshot> {
  const [categories, products] = await Promise.all([tx.menu.listCategories(), tx.menu.listProducts()]);
  return { categories, products, index: indexCategories(categories) };
}

export function placementOf(product: Pick<ProductRecord, 'id' | 'categoryId'>, index: CategoryIndex): ItemPlacement {
  const category = index.get(product.categoryId);
  return {
    productId: product.id,
    categoryId: product.categoryId,
    rootCategoryId: category ? rootOf(category, index).id : product.categoryId,
  };
}

/** Productos no eliminados con los nombres que se copian al vender. */
export function toSellableProducts(snapshot: MenuSnapshot): Map<string, SellableProduct> {
  const map = new Map<string, SellableProduct>();
  for (const product of snapshot.products) {
    if (product.deletedAt !== null) continue;
    const category = snapshot.index.get(product.categoryId);
    if (!category) continue;
    const root = rootOf(category, snapshot.index);
    map.set(product.id, {
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      temperature: product.temperature,
      categoryId: category.id,
      rootCategoryId: root.id,
      categoryName: category.name,
      parentCategoryName: root.id === category.id ? null : root.name,
      sellable: isProductSellable(product, snapshot.index),
    });
  }
  return map;
}

/** A13: el producto o la categoría de un regalo sigue activo y no eliminado. */
export function isGrantScopeAvailable(grant: Pick<GrantWithUsage, 'scope'>, snapshot: MenuSnapshot): boolean {
  switch (grant.scope.type) {
    case 'any':
      return true;
    case 'category': {
      const category = snapshot.index.get(grant.scope.categoryId);
      return category !== undefined && isCategoryVisible(category, snapshot.index);
    }
    case 'product': {
      const id = grant.scope.productId;
      const product = snapshot.products.find((p) => p.id === id);
      return product !== undefined && isProductVisible(product, snapshot.index);
    }
  }
}

export function statusOfGrant(grant: GrantWithUsage, now: Date, snapshot: MenuSnapshot): GrantStatus {
  return grantStatus(grant, now, isGrantScopeAvailable(grant, snapshot));
}

// ── Cortesías de un cliente ──────────────────────────────────────────────────

export interface MonthlyCourtesyView {
  used: number;
  limit: number;
  remaining: number;
}

export interface GrantBalanceView {
  id: string;
  scopeLabel: string;
  scope: GrantWithUsage['scope'];
  remaining: number;
  quantity: number;
  expiresAt: Date | null;
}

export interface CustomerCourtesy {
  monthly: MonthlyCourtesyView | null;
  grants: GrantBalanceView[];
  sources: CourtesySource[];
}

/**
 * Cupo mensual (solo coaches, D3/A7) y regalos vigentes (D11) de un cliente.
 * En `createOrder` se llama después de `lockCustomer`.
 */
export async function loadCustomerCourtesy(
  tx: CafeteriaTx,
  clock: Clock,
  customer: Pick<UserSummary, 'id' | 'role'>,
  snapshot: MenuSnapshot,
  now: Date
): Promise<CustomerCourtesy> {
  const sources: CourtesySource[] = [];
  let monthly: MonthlyCourtesyView | null = null;

  if (customer.role === 'coach') {
    const [settings, used] = await Promise.all([
      tx.settings.get(),
      tx.courtesy.countMonthlyUsed(customer.id, clock.yearMonth(now)),
    ]);
    const remaining = monthlyCourtesyBalance(settings.coachMonthlyCourtesy, used);
    monthly = { used, limit: settings.coachMonthlyCourtesy, remaining };
    sources.push({
      key: 'monthly',
      kind: 'monthly',
      remaining,
      expiresAt: clock.endOfMonth(now),
      specificity: 1,
      createdAt: new Date(0),
      covers: (item) =>
        effectiveCourtesyEligibility(
          { categoryId: item.categoryId, courtesyOverride: snapshot.products.find((p) => p.id === item.productId)?.courtesyOverride ?? null },
          snapshot.index
        ).eligible,
    });
  }

  const grants = (await tx.courtesy.listGrants({ userId: customer.id }))
    .filter((g) => statusOfGrant(g, now, snapshot) === 'active')
    .sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime());

  for (const grant of grants) {
    sources.push({
      key: grant.id,
      kind: 'grant',
      remaining: grantRemaining(grant),
      expiresAt: grant.expiresAt,
      specificity: specificityOf(grant.scope),
      createdAt: grant.createdAt,
      covers: (item) => grantCovers(grant.scope, item),
    });
  }

  return {
    monthly,
    grants: grants.map((g) => ({
      id: g.id,
      scopeLabel: g.scopeLabel,
      scope: g.scope,
      remaining: grantRemaining(g),
      quantity: g.quantity,
      expiresAt: g.expiresAt,
    })),
    sources,
  };
}
