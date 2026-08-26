import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { guestCredits } from '@/db/schema';

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
  userSubscriptionId: string
): Promise<number> {
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
  userSubscriptionId: string
): Promise<void> {
  await db
    .delete(guestCredits)
    .where(
      and(
        eq(guestCredits.userId, userId),
        eq(guestCredits.userSubscriptionId, userSubscriptionId)
      )
    );
}
