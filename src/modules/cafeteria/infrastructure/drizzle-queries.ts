import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import type { db } from '@/db';
import {
  barCashClosings,
  barOrderItems,
  barOrders,
  cafeteriaCategories,
  cafeteriaCourtesyGrants,
  cafeteriaProducts,
  cafeteriaSettings,
  debitCards,
  payments,
  subscriptions,
  userSubscriptions,
  users,
} from '@/db/schema';

/**
 * Consultas Drizzle del módulo. Se separan de los repositorios para que los tests
 * revisen el SQL generado (`toSQL()` / `PgDialect`) sin conectarse a la BD.
 */

/** `db` o la `tx` de un `db.transaction(...)`. */
export type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'execute'>;

// ── Candados ─────────────────────────────────────────────────────────────────

/** Candado de transacción por llave de texto (se libera solo al terminar). */
export function advisoryLock(key: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export const MENU_LOCK_KEY = 'cafeteria-menu';
export const courtesyLockKey = (userId: string) => `bar-courtesy:${userId}`;

// ── Menú ─────────────────────────────────────────────────────────────────────

export const categoryColumns = {
  id: cafeteriaCategories.id,
  parentId: cafeteriaCategories.parentId,
  name: cafeteriaCategories.name,
  usesTemperature: cafeteriaCategories.usesTemperature,
  sortOrder: cafeteriaCategories.sortOrder,
  isActive: cafeteriaCategories.isActive,
  courtesyEligible: cafeteriaCategories.courtesyEligible,
  deletedAt: cafeteriaCategories.deletedAt,
};

export const productColumns = {
  id: cafeteriaProducts.id,
  categoryId: cafeteriaProducts.categoryId,
  name: cafeteriaProducts.name,
  priceCents: cafeteriaProducts.priceCents,
  temperature: cafeteriaProducts.temperature,
  courtesyOverride: cafeteriaProducts.courtesyOverride,
  isAvailable: cafeteriaProducts.isAvailable,
  isActive: cafeteriaProducts.isActive,
  sortOrder: cafeteriaProducts.sortOrder,
  deletedAt: cafeteriaProducts.deletedAt,
};

export const listCategoriesQuery = (x: Executor) => x.select(categoryColumns).from(cafeteriaCategories);
export const listProductsQuery = (x: Executor) => x.select(productColumns).from(cafeteriaProducts);

export const settingsQuery = (x: Executor) =>
  x
    .select({
      coachMonthlyCourtesy: cafeteriaSettings.coachMonthlyCourtesy,
      closingNotifyEmails: cafeteriaSettings.closingNotifyEmails,
      updatedBy: cafeteriaSettings.updatedBy,
      updatedAt: cafeteriaSettings.updatedAt,
    })
    .from(cafeteriaSettings)
    .where(eq(cafeteriaSettings.id, 1));

// ── Usuarios y cuenta bancaria ───────────────────────────────────────────────

export const userColumns = {
  id: users.id,
  name: users.username,
  email: users.email,
  role: users.role,
  deletedAt: users.deletedAt,
};

/** Escapa `%`, `_` y `\` para usar el texto del usuario dentro de un ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const searchUsersQuery = (x: Executor, query: string, limit: number) => {
  const pattern = `%${escapeLike(query)}%`;
  return x
    .select(userColumns)
    .from(users)
    .where(and(isNull(users.deletedAt), or(ilike(users.username, pattern), ilike(users.email, pattern))))
    .orderBy(asc(users.username))
    .limit(limit);
};

export const barAccountQuery = (x: Executor) =>
  x
    .select({ id: debitCards.id, bank: debitCards.cardBank, holder: debitCards.cardName, number: debitCards.cardNumber })
    .from(debitCards)
    .where(and(eq(debitCards.barActive, true), isNull(debitCards.deletedAt)))
    .limit(1);

// ── Descuento por membresía (D13) ───────────────────────────────────────────

/**
 * Suscripción activa con descuento en la barra. Misma regla que el dashboard del cliente
 * (`client/page.tsx`): `active`, pago confirmado, sin vencer y sin estado `expired` ni
 * `suspended`. No exige `status = 'active'`: hay suscripciones anteriores a esa columna que
 * siguen con `pending` aunque estén activas. La de mayor descuento.
 */
export const activeBarDiscountQuery = (x: Executor, userId: string) =>
  x
    .select({ percent: subscriptions.barDiscountPercent, name: subscriptions.name })
    .from(userSubscriptions)
    .innerJoin(subscriptions, eq(subscriptions.id, userSubscriptions.subscriptionId))
    .innerJoin(payments, eq(payments.id, userSubscriptions.paymentId))
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.active, true),
        or(isNull(userSubscriptions.status), notInArray(userSubscriptions.status, ['expired', 'suspended'])),
        eq(payments.confirmed, true),
        or(isNull(userSubscriptions.expirationDate), gt(userSubscriptions.expirationDate, sql`now()`)),
        gt(subscriptions.barDiscountPercent, 0)
      )
    )
    .orderBy(desc(subscriptions.barDiscountPercent))
    .limit(1);

// ── Cortesías ────────────────────────────────────────────────────────────────

/** Cupo mensual usado: líneas `monthly` del periodo en pedidos `paid` (anular devuelve el crédito). */
export const countMonthlyUsedQuery = (x: Executor, userId: string, period: string) =>
  x
    .select({ used: sql<number>`count(*)::int` })
    .from(barOrderItems)
    .innerJoin(barOrders, eq(barOrders.id, barOrderItems.orderId))
    .where(
      and(
        eq(barOrders.status, 'paid'),
        eq(barOrderItems.courtesySource, 'monthly'),
        eq(barOrderItems.courtesyUserId, userId),
        eq(barOrderItems.courtesyPeriod, period)
      )
    );

/**
 * Canjes de un regalo en pedidos `paid`. Con nombres calificados y alias a mano: dentro de
 * un `select`, Drizzle escribe las columnas sin tabla y `"id"` / `"status"` serían ambiguos.
 */
export const grantRedeemedSql = sql<number>`(
  SELECT count(*)::int FROM "bar_order_items" AS "redeemed_item"
  INNER JOIN "bar_orders" AS "redeemed_order" ON "redeemed_order"."id" = "redeemed_item"."order_id"
  WHERE "redeemed_item"."courtesy_grant_id" = "cafeteria_courtesy_grants"."id"
    AND "redeemed_order"."status" = 'paid'
)`;

export const grantColumns = {
  id: cafeteriaCourtesyGrants.id,
  userId: cafeteriaCourtesyGrants.userId,
  grantedBy: cafeteriaCourtesyGrants.grantedBy,
  quantity: cafeteriaCourtesyGrants.quantity,
  scope: cafeteriaCourtesyGrants.scope,
  categoryId: cafeteriaCourtesyGrants.categoryId,
  productId: cafeteriaCourtesyGrants.productId,
  scopeLabel: cafeteriaCourtesyGrants.scopeLabel,
  note: cafeteriaCourtesyGrants.note,
  expiresAt: cafeteriaCourtesyGrants.expiresAt,
  revokedAt: cafeteriaCourtesyGrants.revokedAt,
  revokedBy: cafeteriaCourtesyGrants.revokedBy,
  revokeReason: cafeteriaCourtesyGrants.revokeReason,
  createdAt: cafeteriaCourtesyGrants.createdAt,
  redeemed: grantRedeemedSql,
};

export const listGrantsQuery = (x: Executor, filter: { userId?: string; userIds?: readonly string[] }) =>
  x
    .select(grantColumns)
    .from(cafeteriaCourtesyGrants)
    .where(
      and(
        filter.userId ? eq(cafeteriaCourtesyGrants.userId, filter.userId) : undefined,
        filter.userIds ? inArray(cafeteriaCourtesyGrants.userId, [...filter.userIds]) : undefined
      )
    )
    .orderBy(desc(cafeteriaCourtesyGrants.createdAt))
    .limit(500);

export const revokeGrantQuery = (x: Executor, id: string, patch: { revokedAt: Date; revokedBy: string; revokeReason: string }) =>
  x
    .update(cafeteriaCourtesyGrants)
    .set(patch)
    .where(and(eq(cafeteriaCourtesyGrants.id, id), isNull(cafeteriaCourtesyGrants.revokedAt)))
    .returning({ id: cafeteriaCourtesyGrants.id });

// ── Pedidos ──────────────────────────────────────────────────────────────────

export const orderColumns = {
  id: barOrders.id,
  folio: barOrders.folio,
  requestId: barOrders.requestId,
  status: barOrders.status,
  customerName: barOrders.customerName,
  customerUserId: barOrders.customerUserId,
  paymentMethod: barOrders.paymentMethod,
  bankAccountId: barOrders.bankAccountId,
  totalCents: barOrders.totalCents,
  subtotalCents: barOrders.subtotalCents,
  discountCents: barOrders.discountCents,
  discountPercent: barOrders.discountPercent,
  discountLabel: barOrders.discountLabel,
  createdBy: barOrders.createdBy,
  createdAt: barOrders.createdAt,
  closingId: barOrders.closingId,
  voidedAt: barOrders.voidedAt,
  voidedBy: barOrders.voidedBy,
  voidReason: barOrders.voidReason,
};

export const itemColumns = {
  orderId: barOrderItems.orderId,
  productId: barOrderItems.productId,
  productName: barOrderItems.productName,
  categoryName: barOrderItems.categoryName,
  parentCategoryName: barOrderItems.parentCategoryName,
  temperature: barOrderItems.temperature,
  unitPriceCents: barOrderItems.unitPriceCents,
  quantity: barOrderItems.quantity,
  isCourtesy: barOrderItems.isCourtesy,
  courtesyUserId: barOrderItems.courtesyUserId,
  courtesySource: barOrderItems.courtesySource,
  courtesyPeriod: barOrderItems.courtesyPeriod,
  courtesyGrantId: barOrderItems.courtesyGrantId,
  lineTotalCents: barOrderItems.lineTotalCents,
};

/** Pedidos pagados sin corte. Con `forUpdate`, el corte los bloquea (§5). */
export const listOpenOrdersQuery = (x: Executor, forUpdate: boolean) => {
  const query = x
    .select(orderColumns)
    .from(barOrders)
    .where(and(isNull(barOrders.closingId), eq(barOrders.status, 'paid')))
    .orderBy(asc(barOrders.folio));
  return forUpdate ? query.for('update') : query;
};

export const listOrdersBetweenQuery = (x: Executor, from: Date, to: Date) =>
  x
    .select(orderColumns)
    .from(barOrders)
    .where(and(gte(barOrders.createdAt, from), lte(barOrders.createdAt, to)))
    .orderBy(desc(barOrders.folio));

export const markClosedQuery = (x: Executor, ids: readonly string[], closingId: string) =>
  x
    .update(barOrders)
    .set({ closingId })
    .where(and(inArray(barOrders.id, [...ids]), isNull(barOrders.closingId), eq(barOrders.status, 'paid')));

/** D8: solo `paid` y sin corte; la guarda va en el WHERE. */
export const voidOrderQuery = (x: Executor, id: string, patch: { voidedAt: Date; voidedBy: string; voidReason: string }) =>
  x
    .update(barOrders)
    .set({ ...patch, status: 'voided' })
    .where(and(eq(barOrders.id, id), eq(barOrders.status, 'paid'), isNull(barOrders.closingId)))
    .returning({ id: barOrders.id });

// ── Cortes ───────────────────────────────────────────────────────────────────

/** Solo un corte `pending` se resuelve; el correo 2 queda `pending` hasta enviarlo. */
export const resolveClosingQuery = (
  x: Executor,
  id: string,
  patch: {
    status: 'approved' | 'approved_with_shortfall';
    resolvedBy: string;
    resolvedAt: Date;
    cashReceivedCents: number;
    shortfallCents: number;
    resolutionNote: string | null;
  }
) =>
  x
    .update(barCashClosings)
    .set({ ...patch, resolvedEmailStatus: 'pending' })
    .where(and(eq(barCashClosings.id, id), eq(barCashClosings.status, 'pending')))
    .returning({ id: barCashClosings.id });
