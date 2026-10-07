import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { guestCredits } from '@/db/schema';

/**
 * Pases de invitado de una membresía (SPEC-SPECIAL-PACKAGES §5.7, D6):
 * - Open Lab (`guest = true`): 1 por ciclo, como siempre.
 * - Paquete especial: los copiados al comprar (`guest_credits_snapshot`), para toda la vigencia.
 * - Cualquier otro paquete: 0.
 */
export function guestCreditsTotalFor(membership: {
  subscription: { guest: boolean | null; kind?: string | null } | null;
  userSub: { guestCreditsSnapshot?: number | null };
}): number {
  if (membership.subscription?.guest === true) return 1;
  if (membership.subscription?.kind === 'special') return membership.userSub.guestCreditsSnapshot ?? 0;
  return 0;
}

/**
 * Get available guest credits for a user within a specific subscription cycle.
 *
 * Credit model:
 * - Each Open Lab subscription grants 1 guest credit per billing cycle.
 * - If no record exists in guest_credits for this user+subscription, credit is available (1).
 * - If a record exists with creditsUsed = 0, credit is available (1).
 * - If a record exists with creditsUsed >= 1, credit is exhausted (0).
 *
 * @returns Number of available credits (0 or 1)
 */
export async function getGuestCreditsForCycle(
  userId: string,
  userSubscriptionId: string,
  total = 1
): Promise<number> {
  // Paquetes especiales con varios pases: una fila de guest_credits por invitado.
  if (total > 1) {
    const rows = await db
      .select({ creditsUsed: guestCredits.creditsUsed })
      .from(guestCredits)
      .where(and(eq(guestCredits.userId, userId), eq(guestCredits.userSubscriptionId, userSubscriptionId)));
    const used = rows.reduce((sum, row) => sum + row.creditsUsed, 0);
    return Math.max(0, total - used);
  }

  const creditRecord = await db.query.guestCredits.findFirst({
    where: and(
      eq(guestCredits.userId, userId),
      eq(guestCredits.userSubscriptionId, userSubscriptionId)
    ),
  });

  if (!creditRecord) {
    return 1; // No record means full credit available
  }

  return creditRecord.creditsUsed >= 1 ? 0 : 1;
}

/**
 * Consume a guest credit for the user's current subscription cycle.
 *
 * Creates a new record in guest_credits with creditsUsed = 1 and a reference
 * to the guest enrollment that consumed it.
 *
 * @throws Error if credit has already been consumed (creditsUsed >= 1)
 */
export async function consumeGuestCredit(
  userId: string,
  userSubscriptionId: string,
  guestEnrollmentId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    // Check if a record already exists for this cycle
    const existing = await tx.query.guestCredits.findFirst({
      where: and(
        eq(guestCredits.userId, userId),
        eq(guestCredits.userSubscriptionId, userSubscriptionId)
      ),
    });

    if (existing) {
      if (existing.creditsUsed >= 1) {
        throw new Error('No guest credits available for this cycle.');
      }

      // Update existing record
      await tx
        .update(guestCredits)
        .set({
          creditsUsed: 1,
          guestEnrollmentId,
        })
        .where(eq(guestCredits.id, existing.id));
    } else {
      // Insert new credit usage record
      await tx.insert(guestCredits).values({
        userId,
        userSubscriptionId,
        creditsUsed: 1,
        guestEnrollmentId,
      });
    }
  });
}

/**
 * Restore a guest credit for the user's current subscription cycle.
 *
 * Used when a reservation with guest is cancelled with more than 24 hours
 * of anticipation. Deletes the credit usage record so the user can invite again.
 */
export async function restoreGuestCredit(
  userId: string,
  userSubscriptionId: string,
  guestEnrollmentId?: string
): Promise<void> {
  // With several passes (special packages) only the cancelled guest's pass comes back (H10).
  await db
    .delete(guestCredits)
    .where(
      and(
        eq(guestCredits.userId, userId),
        eq(guestCredits.userSubscriptionId, userSubscriptionId),
        guestEnrollmentId ? eq(guestCredits.guestEnrollmentId, guestEnrollmentId) : undefined
      )
    );
}

type GuestCreditExecutor = Pick<typeof db, 'execute' | 'select'>;

/**
 * Consume un pase de invitado dentro de la transacción de la reserva. Con un solo pase
 * (Open Lab) reutiliza la fila del ciclo; con varios, bloquea la suscripción (INV-5) y
 * agrega una fila por invitado. Lanza `Error('NO_CREDITS')` si ya no hay pases.
 */
export async function consumeGuestCreditInTx(
  tx: GuestCreditExecutor,
  input: { userId: string; userSubscriptionId: string; guestEnrollmentId: string; total: number }
): Promise<void> {
  const { userId, userSubscriptionId, guestEnrollmentId, total } = input;

  if (total > 1) {
    await tx.execute(sql`SELECT id FROM user_suscriptions WHERE id = ${userSubscriptionId} FOR UPDATE`);
    const rows = await tx
      .select()
      .from(guestCredits)
      .where(and(eq(guestCredits.userId, userId), eq(guestCredits.userSubscriptionId, userSubscriptionId)));
    const used = rows.reduce((sum, row) => sum + row.creditsUsed, 0);
    if (used >= total) throw new Error('NO_CREDITS');
    await tx.execute(
      sql`INSERT INTO guest_credits (user_id, user_subscription_id, credits_used, guest_enrollment_id) VALUES (${userId}, ${userSubscriptionId}, 1, ${guestEnrollmentId})`
    );
    return;
  }

  const [existingCredit] = await tx
    .select()
    .from(guestCredits)
    .where(and(eq(guestCredits.userId, userId), eq(guestCredits.userSubscriptionId, userSubscriptionId)));

  if (existingCredit) {
    if (existingCredit.creditsUsed >= 1) {
      throw new Error('NO_CREDITS');
    }
    await tx.execute(
      sql`UPDATE guest_credits SET credits_used = 1, guest_enrollment_id = ${guestEnrollmentId} WHERE id = ${existingCredit.id} AND credits_used = 0`
    );
  } else {
    await tx.execute(
      sql`INSERT INTO guest_credits (user_id, user_subscription_id, credits_used, guest_enrollment_id) VALUES (${userId}, ${userSubscriptionId}, 1, ${guestEnrollmentId})`
    );
  }
}
