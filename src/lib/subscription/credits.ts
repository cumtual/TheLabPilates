import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import type { db } from '@/db';
import { userSubscriptionBalances, userSubscriptions, type PackageKind } from '@/db/schema';
import type { ClassType } from '@/lib/utils/class-type';
import { DEFAULT_VALIDITY_DAYS } from './package-schema';
import {
  balanceLabel,
  explainRejection,
  pickBalanceForClass,
  type BookingRejection,
  type ClassForRules,
} from './rules';

/**
 * Único módulo que escribe créditos: `days_remaining`, `credits_remaining` y
 * `balance_id` (SPEC-SPECIAL-PACKAGES §5.5, INV-3; lo vigila credit-writers.test.ts).
 *
 * INV-1: en un paquete especial activo, `days_remaining = Σ credits_remaining`;
 * ambos cambian en la misma transacción del llamador.
 * INV-5: orden de bloqueo `open_class` → `user_suscriptions` → `user_subscription_balances`.
 */

/** `db` o la `tx` de un `db.transaction(...)`. */
export type CreditExecutor = Pick<typeof db, 'execute' | 'select' | 'update' | 'insert'>;

export class BookingRejectionError extends Error {
  constructor(readonly rejection: BookingRejection) {
    super(rejection.message);
    this.name = 'BookingRejectionError';
  }
}

const NO_CREDITS_MESSAGE = 'No tienes créditos de sesión disponibles.';

export type CreditSource = {
  userSubscriptionId: string;
  kind: PackageKind;
  isOpenLab: boolean;
  packageName: string;
};

async function lockSubscription(executor: CreditExecutor, userSubscriptionId: string): Promise<void> {
  await executor.execute(sql`SELECT id FROM user_suscriptions WHERE id = ${userSubscriptionId} FOR UPDATE`);
}

/**
 * Descuenta el crédito de una reserva. Devuelve el grupo consumido (`null` fuera de
 * paquetes especiales) o lanza `BookingRejectionError`, lo que revierte la transacción.
 */
export async function consumeClassCredit(
  executor: CreditExecutor,
  source: CreditSource,
  cls: ClassForRules
): Promise<string | null> {
  if (source.isOpenLab) return null;

  if (source.kind !== 'special') {
    await executor.execute(sql`
        UPDATE user_suscriptions
        SET days_remaining = days_remaining - 1
        WHERE id = ${source.userSubscriptionId} AND days_remaining > 0
      `);
    return null;
  }

  await lockSubscription(executor, source.userSubscriptionId);
  const balances = await executor
    .select()
    .from(userSubscriptionBalances)
    .where(eq(userSubscriptionBalances.userSubscriptionId, source.userSubscriptionId));

  const picked = pickBalanceForClass(balances, cls);
  if (!picked) {
    throw new BookingRejectionError(
      explainRejection(balances, cls, source.packageName) ?? { code: 'NO_CREDITS', message: NO_CREDITS_MESSAGE }
    );
  }

  const consumed = await executor
    .update(userSubscriptionBalances)
    .set({ creditsRemaining: sql`credits_remaining - 1` })
    .where(and(eq(userSubscriptionBalances.id, picked.id), gt(userSubscriptionBalances.creditsRemaining, 0)))
    .returning({ id: userSubscriptionBalances.id });
  if (consumed.length === 0) {
    const afterRace = balances.map((b) => (b.id === picked.id ? { ...b, creditsRemaining: 0 } : b));
    throw new BookingRejectionError(
      explainRejection(afterRace, cls, source.packageName) ?? { code: 'NO_CREDITS', message: NO_CREDITS_MESSAGE }
    );
  }

  const total = await executor
    .update(userSubscriptions)
    .set({ daysRemaining: sql`days_remaining - 1` })
    .where(and(eq(userSubscriptions.id, source.userSubscriptionId), gt(userSubscriptions.daysRemaining, 0)))
    .returning({ id: userSubscriptions.id });
  if (total.length === 0) {
    throw new BookingRejectionError({ code: 'NO_CREDITS', message: NO_CREDITS_MESSAGE });
  }

  return picked.id;
}

export type RestoreOutcome = 'restored' | 'no_credit_tracking' | 'subscription_inactive';

/**
 * Reintegra el crédito de una reserva cancelada a tiempo. Con `balanceId` vuelve a su
 * grupo; sin él, al total como siempre. Open Lab no lleva créditos (H14). Una
 * suscripción ya no vigente (reemplazada o vencida) no recibe reintegro (S1).
 */
export async function restoreEnrollmentCredit(
  executor: CreditExecutor,
  enrollment: { userSubscriptionId: string; balanceId: string | null; isOpenLab: boolean; subscriptionActive: boolean }
): Promise<RestoreOutcome> {
  if (!enrollment.subscriptionActive) return 'subscription_inactive';
  if (enrollment.isOpenLab) return 'no_credit_tracking';

  if (enrollment.balanceId) {
    const restored = await executor
      .update(userSubscriptionBalances)
      .set({ creditsRemaining: sql`credits_remaining + 1` })
      .where(
        and(
          eq(userSubscriptionBalances.id, enrollment.balanceId),
          sql`${userSubscriptionBalances.creditsRemaining} < ${userSubscriptionBalances.creditsTotal}`
        )
      )
      .returning({ id: userSubscriptionBalances.id });
    // Grupo ya lleno: no hay nada que reintegrar sin romper INV-1.
    if (restored.length === 0) return 'restored';
  }

  await executor.execute(sql`
          UPDATE user_suscriptions
          SET days_remaining = days_remaining + 1
          WHERE id = ${enrollment.userSubscriptionId}
        `);
  return 'restored';
}

/** Suma créditos sin grupo (crédito manual del admin en paquetes estándar). */
export async function grantLegacyCredit(executor: CreditExecutor, userSubscriptionId: string): Promise<void> {
  await executor.execute(sql`
    UPDATE user_suscriptions
    SET days_remaining = days_remaining + 1
    WHERE id = ${userSubscriptionId}
  `);
}

/** Descuento manual de un paquete estándar con guarda `> 0`. Devuelve el saldo o `null` si no había. */
export async function decrementLegacyCredit(executor: CreditExecutor, userSubscriptionId: string): Promise<number | null> {
  const [updated] = await executor
    .update(userSubscriptions)
    .set({ daysRemaining: sql`days_remaining - 1` })
    .where(and(eq(userSubscriptions.id, userSubscriptionId), gt(userSubscriptions.daysRemaining, 0)))
    .returning({ daysRemaining: userSubscriptions.daysRemaining });
  return updated ? (updated.daysRemaining ?? 0) : null;
}

/** Copia al comprar (D4). `validityDays` NULL = 30 días. */
export function buildSubscriptionSnapshot(pkg: { price: number | null; validityDays: number | null; guestCredits: number }) {
  return {
    priceSnapshot: pkg.price,
    validityDaysSnapshot: pkg.validityDays ?? DEFAULT_VALIDITY_DAYS,
    guestCreditsSnapshot: pkg.guestCredits,
  };
}

type RuleRow = {
  id: string;
  label: string | null;
  credits: number;
  allowedClassTypes: ClassType[];
  windowStart: string | null;
  windowEnd: string | null;
  sortOrder: number;
};

/** Un balance por regla, en 0 hasta que se confirme el pago (`activateBalances`). */
export function balanceRowsFromRules(userSubscriptionId: string, rules: readonly RuleRow[]) {
  return rules.map((rule) => ({
    userSubscriptionId,
    ruleId: rule.id,
    label: balanceLabel(rule),
    allowedClassTypes: rule.allowedClassTypes,
    windowStart: rule.windowStart,
    windowEnd: rule.windowEnd,
    creditsTotal: rule.credits,
    creditsRemaining: 0,
    sortOrder: rule.sortOrder,
  }));
}

export async function insertBalancesFromRules(
  executor: CreditExecutor,
  userSubscriptionId: string,
  rules: readonly RuleRow[]
): Promise<void> {
  if (rules.length === 0) return;
  await executor.insert(userSubscriptionBalances).values(balanceRowsFromRules(userSubscriptionId, rules));
}

/** Al confirmar el pago de un especial: cada grupo a su total. */
export async function activateBalances(executor: CreditExecutor, userSubscriptionId: string): Promise<void> {
  await executor
    .update(userSubscriptionBalances)
    .set({ creditsRemaining: sql`${userSubscriptionBalances.creditsTotal}` })
    .where(eq(userSubscriptionBalances.userSubscriptionId, userSubscriptionId));
}

/** Al confirmar el pago: suma las sesiones del paquete y fija la vigencia desde ahora (D3). */
export async function grantPackageCredits(
  executor: CreditExecutor,
  paymentId: string,
  sessionsToAdd: number
): Promise<void> {
  await executor.execute(sql`
      UPDATE user_suscriptions
      SET days_remaining = days_remaining + ${sessionsToAdd},
          expiration_date = NOW() + make_interval(days => COALESCE(validity_days_snapshot, ${DEFAULT_VALIDITY_DAYS}))
      WHERE payment_id = ${paymentId}
    `);
}

/**
 * D2: una sola suscripción activa. Vence las demás activas del usuario y pierde sus
 * créditos (también los de sus grupos). Devuelve los ids vencidos.
 */
export async function expireOtherActiveSubscriptions(
  executor: CreditExecutor,
  userId: string,
  keepId: string
): Promise<string[]> {
  const expired = await executor
    .update(userSubscriptions)
    .set({ active: false, status: 'expired', expirationDate: new Date(), daysRemaining: 0 })
    .where(
      and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.active, true), ne(userSubscriptions.id, keepId))
    )
    .returning({ id: userSubscriptions.id });

  const ids = expired.map((row) => row.id);
  if (ids.length > 0) {
    await executor
      .update(userSubscriptionBalances)
      .set({ creditsRemaining: 0 })
      .where(inArray(userSubscriptionBalances.userSubscriptionId, ids));
  }
  return ids;
}

export type ManualAdjustResult = { ok: true; daysRemaining: number } | { ok: false; error: string };

/** D5: ajuste manual del admin sobre un grupo de un paquete especial (grupo y total juntos). */
export async function adjustCreditManually(
  executor: CreditExecutor,
  input: { userSubscriptionId: string; balanceId: string; delta: 1 | -1 }
): Promise<ManualAdjustResult> {
  const [balance] = await executor
    .select()
    .from(userSubscriptionBalances)
    .where(
      and(
        eq(userSubscriptionBalances.id, input.balanceId),
        eq(userSubscriptionBalances.userSubscriptionId, input.userSubscriptionId)
      )
    );
  if (!balance) return { ok: false, error: 'Ese grupo no pertenece a la suscripción.' };

  const fullError = 'Ese grupo ya tiene todos sus créditos.';
  const emptyError = 'Ese grupo ya no tiene créditos.';
  if (input.delta === 1 && balance.creditsRemaining >= balance.creditsTotal) return { ok: false, error: fullError };
  if (input.delta === -1 && balance.creditsRemaining <= 0) return { ok: false, error: emptyError };

  const groupGuard =
    input.delta === 1
      ? sql`${userSubscriptionBalances.creditsRemaining} < ${userSubscriptionBalances.creditsTotal}`
      : gt(userSubscriptionBalances.creditsRemaining, 0);
  const updatedGroup = await executor
    .update(userSubscriptionBalances)
    .set({ creditsRemaining: input.delta === 1 ? sql`credits_remaining + 1` : sql`credits_remaining - 1` })
    .where(and(eq(userSubscriptionBalances.id, balance.id), groupGuard))
    .returning({ id: userSubscriptionBalances.id });
  if (updatedGroup.length === 0) return { ok: false, error: input.delta === 1 ? fullError : emptyError };

  const [total] = await executor
    .update(userSubscriptions)
    .set({ daysRemaining: input.delta === 1 ? sql`days_remaining + 1` : sql`days_remaining - 1` })
    .where(
      input.delta === 1
        ? eq(userSubscriptions.id, input.userSubscriptionId)
        : and(eq(userSubscriptions.id, input.userSubscriptionId), gt(userSubscriptions.daysRemaining, 0))
    )
    .returning({ daysRemaining: userSubscriptions.daysRemaining });
  if (!total) throw new Error('La suscripción no tiene créditos disponibles.');

  return { ok: true, daysRemaining: total.daysRemaining ?? 0 };
}
