import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import type { BalanceForRules } from '@/lib/subscription/rules';
import { db } from '@/db';
import { subscriptions, userSubscriptionBalances, userSubscriptions } from '@/db/schema';
import { assertAdminViewer, type AuditViewer } from '@/lib/queries/admin-enrollment-audit';
import { DEFAULT_VALIDITY_DAYS } from '@/lib/subscription/package-schema';
import {
  toCreditBalanceViews,
  toPackageCardView,
  type CreditBalanceView,
  type PackageCardView,
} from '@/lib/subscription/package-view';
import { hhmmToMinutes, minutesToHHMM } from '@/lib/utils/date';
import type { ClassType } from '@/lib/utils/class-type';
import type { PackageKind } from '@/db/schema';

/** Lecturas del catálogo y de saldos (SPEC-SPECIAL-PACKAGES §4.4). */

/** Paquetes visibles en la landing y la tienda: activos y no eliminados. */
export async function getPublicPackages(): Promise<PackageCardView[]> {
  const rows = await db.query.subscriptions.findMany({
    where: and(eq(subscriptions.isActive, true), isNull(subscriptions.deletedAt)),
    with: { rules: { orderBy: (rules, { asc: byAsc }) => [byAsc(rules.sortOrder)] } },
    orderBy: [asc(subscriptions.displayOrder), asc(subscriptions.price)],
  });
  return rows.map(toPackageCardView);
}

export type AdminPackageView = PackageCardView & {
  kind: PackageKind;
  isActive: boolean;
  validityDays: number;
  guestCredits: number;
  displayOrder: number;
  salesCount: number;
  rules: { label: string | null; credits: number; allowedClassTypes: ClassType[]; timeWindow: { start: string; end: string } | null }[];
};

const toHHMM = (value: string) => minutesToHHMM(hhmmToMinutes(value));

/** Catálogo completo (sin eliminados) para `/admin/packages`. Exige admin antes de tocar la BD. */
export async function getAdminPackages(viewer: AuditViewer): Promise<AdminPackageView[]> {
  assertAdminViewer(viewer);

  const rows = await db.query.subscriptions.findMany({
    where: isNull(subscriptions.deletedAt),
    with: { rules: { orderBy: (rules, { asc: byAsc }) => [byAsc(rules.sortOrder)] } },
    orderBy: [asc(subscriptions.displayOrder), asc(subscriptions.price)],
  });
  const ids = rows.map((row) => row.id);
  const sales = ids.length
    ? await db
        .select({ subscriptionId: userSubscriptions.subscriptionId, total: count() })
        .from(userSubscriptions)
        .where(inArray(userSubscriptions.subscriptionId, ids))
        .groupBy(userSubscriptions.subscriptionId)
    : [];
  const salesById = new Map(sales.map((row) => [row.subscriptionId, Number(row.total)]));

  return rows.map((row) => ({
    ...toPackageCardView(row),
    kind: row.kind,
    isActive: row.isActive,
    validityDays: row.validityDays ?? DEFAULT_VALIDITY_DAYS,
    guestCredits: row.guestCredits,
    displayOrder: row.displayOrder,
    salesCount: salesById.get(row.id) ?? 0,
    rules: row.rules.map((rule) => ({
      label: rule.label,
      credits: rule.credits,
      allowedClassTypes: rule.allowedClassTypes,
      timeWindow: rule.windowStart && rule.windowEnd ? { start: toHHMM(rule.windowStart), end: toHHMM(rule.windowEnd) } : null,
    })),
  }));
}

/** Un paquete para editar (o `null` si no existe o fue eliminado). */
export async function getAdminPackage(viewer: AuditViewer, id: string): Promise<AdminPackageView | null> {
  const all = await getAdminPackages(viewer);
  return all.find((pkg) => pkg.id === id) ?? null;
}

/** Desglose de créditos de una suscripción especial, en `sort_order`. */
export async function getSubscriptionBalances(userSubscriptionId: string): Promise<CreditBalanceView[]> {
  const rows = await db
    .select()
    .from(userSubscriptionBalances)
    .where(eq(userSubscriptionBalances.userSubscriptionId, userSubscriptionId));
  return toCreditBalanceViews(rows);
}

/** Suscripción especial activa del cliente con sus grupos (para la lista de clases), o `null`. */
export async function getActiveSpecialPackage(
  userId: string
): Promise<{ packageName: string; balances: BalanceForRules[] } | null> {
  const [active] = await db
    .select({ id: userSubscriptions.id, name: subscriptions.name })
    .from(userSubscriptions)
    .innerJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.active, true), eq(subscriptions.kind, 'special')))
    .orderBy(asc(userSubscriptions.expirationDate))
    .limit(1);
  if (!active) return null;

  const balances = await db
    .select()
    .from(userSubscriptionBalances)
    .where(eq(userSubscriptionBalances.userSubscriptionId, active.id));
  return { packageName: active.name ?? 'paquete', balances };
}
