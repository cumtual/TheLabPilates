import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  barCashClosings,
  barOrderItems,
  barOrders,
  cafeteriaCategories,
  cafeteriaCourtesyGrants,
  cafeteriaProducts,
  cafeteriaSettings,
  users,
} from '@/db/schema';
import { CafeteriaError } from '../domain/errors';
import type { GrantScope } from '../domain/courtesy-grants';
import type { CafeteriaTx, GrantRow, GrantWithUsage, SettingsRow, UnitOfWork } from '../application/ports';
import {
  activeBarDiscountQuery,
  advisoryLock,
  barAccountQuery,
  categoryColumns,
  countMonthlyUsedQuery,
  courtesyLockKey,
  grantColumns,
  itemColumns,
  listCategoriesQuery,
  listGrantsQuery,
  listOpenOrdersQuery,
  listOrdersBetweenQuery,
  listProductsQuery,
  markClosedQuery,
  MENU_LOCK_KEY,
  orderColumns,
  productColumns,
  resolveClosingQuery,
  revokeGrantQuery,
  searchUsersQuery,
  settingsQuery,
  userColumns,
  voidOrderQuery,
  type Executor,
} from './drizzle-queries';

/** Repositorios Drizzle del módulo (SPEC-CAFETERIA §10) sobre `db` o una transacción. */

type GrantSelect = Omit<GrantRow, 'scope'> & {
  scope: 'any' | 'category' | 'product';
  categoryId: string | null;
  productId: string | null;
  redeemed: number;
};

function toScope(row: Pick<GrantSelect, 'scope' | 'categoryId' | 'productId'>): GrantScope {
  if (row.scope === 'category') return { type: 'category', categoryId: row.categoryId! };
  if (row.scope === 'product') return { type: 'product', productId: row.productId! };
  return { type: 'any' };
}

function toGrant({ scope, categoryId, productId, redeemed, ...row }: GrantSelect): GrantWithUsage {
  return { ...row, scope: toScope({ scope, categoryId, productId }), redeemed: Number(redeemed) };
}

function scopeColumns(scope: GrantScope) {
  return {
    scope: scope.type,
    categoryId: scope.type === 'category' ? scope.categoryId : null,
    productId: scope.type === 'product' ? scope.productId : null,
  };
}

const DEFAULT_SETTINGS: SettingsRow = {
  coachMonthlyCourtesy: 4,
  closingNotifyEmails: ['thelabpilates77@gmail.com'],
  updatedBy: null,
  updatedAt: new Date(0),
};

/** Código 23505 de Postgres sobre el `request_id` del pedido. */
function isDuplicateRequest(error: unknown): boolean {
  const e = error as { code?: string; constraint_name?: string; message?: string; cause?: unknown };
  const target = (e?.cause as typeof e) ?? e;
  return target?.code === '23505' && String(target.constraint_name ?? target.message ?? '').includes('request_id');
}

export function createDrizzleTx(x: Executor): CafeteriaTx {
  return {
    menu: {
      listCategories: () => listCategoriesQuery(x).orderBy(asc(cafeteriaCategories.sortOrder)),
      listProducts: () => listProductsQuery(x).orderBy(asc(cafeteriaProducts.sortOrder)),
      lockMenu: async () => {
        await x.execute(advisoryLock(MENU_LOCK_KEY));
      },
      insertCategory: async (row) => {
        const [created] = await x.insert(cafeteriaCategories).values(row).returning(categoryColumns);
        return created;
      },
      updateCategory: async (id, patch) => {
        await x.update(cafeteriaCategories).set({ ...patch, updatedAt: sql`now()` }).where(eq(cafeteriaCategories.id, id));
      },
      insertProduct: async (row) => {
        const [created] = await x.insert(cafeteriaProducts).values(row).returning(productColumns);
        return created;
      },
      updateProduct: async (id, patch) => {
        await x.update(cafeteriaProducts).set({ ...patch, updatedAt: sql`now()` }).where(eq(cafeteriaProducts.id, id));
      },
    },

    settings: {
      get: async () => (await settingsQuery(x))[0] ?? DEFAULT_SETTINGS,
      update: async (patch) => {
        await x.update(cafeteriaSettings).set(patch).where(eq(cafeteriaSettings.id, 1));
      },
    },

    users: {
      findById: async (id) => (await x.select(userColumns).from(users).where(eq(users.id, id)).limit(1))[0] ?? null,
      findMany: async (ids) => (ids.length === 0 ? [] : x.select(userColumns).from(users).where(inArray(users.id, [...ids]))),
      search: (query, limit) => searchUsersQuery(x, query, limit),
    },

    courtesy: {
      lockCustomer: async (userId) => {
        await x.execute(advisoryLock(courtesyLockKey(userId)));
      },
      countMonthlyUsed: async (userId, period) => (await countMonthlyUsedQuery(x, userId, period))[0]?.used ?? 0,
      listGrants: async (filter) => {
        if (filter.userIds && filter.userIds.length === 0) return [];
        return (await listGrantsQuery(x, filter)).map(toGrant);
      },
      findGrant: async (id) => {
        const [row] = await x.select(grantColumns).from(cafeteriaCourtesyGrants).where(eq(cafeteriaCourtesyGrants.id, id)).limit(1);
        return row ? toGrant(row) : null;
      },
      insertGrant: async ({ scope, ...row }) => {
        const [created] = await x
          .insert(cafeteriaCourtesyGrants)
          .values({ ...row, ...scopeColumns(scope) })
          .returning();
        return toGrant({ ...created, redeemed: 0 });
      },
      revokeGrant: async (id, patch) => (await revokeGrantQuery(x, id, patch)).length > 0,
    },

    orders: {
      findByRequestId: async (requestId) =>
        (await x.select(orderColumns).from(barOrders).where(eq(barOrders.requestId, requestId)).limit(1))[0] ?? null,
      insert: async (order, items) => {
        try {
          const [created] = await x.insert(barOrders).values(order).returning(orderColumns);
          if (items.length > 0) {
            await x.insert(barOrderItems).values(items.map((item) => ({ ...item, orderId: created.id })));
          }
          return created;
        } catch (error) {
          if (isDuplicateRequest(error)) throw new CafeteriaError('CONFLICT', 'Este cobro ya se registró. Revisa el turno.');
          throw error;
        }
      },
      findById: async (id) => (await x.select(orderColumns).from(barOrders).where(eq(barOrders.id, id)).limit(1))[0] ?? null,
      itemsOf: async (ids) =>
        ids.length === 0
          ? []
          : x.select(itemColumns).from(barOrderItems).where(inArray(barOrderItems.orderId, [...ids])).orderBy(asc(barOrderItems.id)),
      listOpen: ({ forUpdate }) => listOpenOrdersQuery(x, forUpdate),
      listByClosing: (closingId) => x.select(orderColumns).from(barOrders).where(eq(barOrders.closingId, closingId)).orderBy(asc(barOrders.folio)),
      listCreatedBetween: ({ from, to }) => listOrdersBetweenQuery(x, from, to),
      markClosed: async (ids, closingId) => {
        await markClosedQuery(x, ids, closingId);
      },
      void: async (id, patch) => (await voidOrderQuery(x, id, patch)).length > 0,
    },

    closings: {
      insert: async (row) => {
        const [created] = await x.insert(barCashClosings).values(row).returning();
        return created;
      },
      findById: async (id) => (await x.select().from(barCashClosings).where(eq(barCashClosings.id, id)).limit(1))[0] ?? null,
      resolve: async (id, patch) => (await resolveClosingQuery(x, id, patch)).length > 0,
      setEmailStatus: async (id, which, status, at) => {
        await x
          .update(barCashClosings)
          .set(which === 'created' ? { createdEmailStatus: status, createdEmailSentAt: at } : { resolvedEmailStatus: status, resolvedEmailSentAt: at })
          .where(eq(barCashClosings.id, id));
      },
      listPending: () => x.select().from(barCashClosings).where(eq(barCashClosings.status, 'pending')).orderBy(asc(barCashClosings.createdAt)),
      listRecent: (limit) => x.select().from(barCashClosings).orderBy(desc(barCashClosings.createdAt)).limit(limit),
    },

    bank: {
      getBarAccount: async () => (await barAccountQuery(x))[0] ?? null,
    },

    memberships: {
      activeBarDiscount: async (userId) => {
        const [row] = await activeBarDiscountQuery(x, userId);
        return row ? { percent: row.percent, label: `${row.name ?? 'Membresía'} ${row.percent}%` } : null;
      },
    },
  };
}

/** Escrituras en `db.transaction`; lecturas directas (PgBouncer en modo transacción). */
export const drizzleUnitOfWork: UnitOfWork = {
  run: (work) => db.transaction((tx) => work(createDrizzleTx(tx))),
  read: (work) => work(createDrizzleTx(db)),
};

