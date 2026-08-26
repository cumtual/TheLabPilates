import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import {
  userSubscriptions,
  subscriptions,
  payments,
  guestCredits,
} from '@/db/schema';
import type { GuestEligibilityResult } from '@/lib/types/guest';

/**
 * Check if a user has an active Open Lab membership that is eligible for guest invitations.
 *
 * Conditions (ALL must be met):
 * 1. User has a subscription with status 'active'
 * 2. The associated subscription plan has `guest = true`
 * 3. The payment is confirmed
 * 4. The membership has not expired (expiration_date > now)
 */
export async function isUserOpenLabEligible(userId: string): Promise<{
  eligible: boolean;
  userSubscription: typeof userSubscriptions.$inferSelect | null;
  subscription: typeof subscriptions.$inferSelect | null;
}> {
  const now = new Date();

  // Query all active user subscriptions with their plan and payment info
  const results = await db
    .select({
      userSub: userSubscriptions,
      subscription: subscriptions,
      payment: payments,
    })
    .from(userSubscriptions)
    .innerJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .innerJoin(payments, eq(userSubscriptions.paymentId, payments.id))
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.active, true),
        eq(userSubscriptions.status, 'active')
      )
    );

  // Find the first subscription that meets all eligibility criteria
  const eligible = results.find((row) => {
    // Must be an Open Lab plan (guest = true)
    if (!row.subscription.guest) return false;
    // Payment must be confirmed
    if (!row.payment.confirmed) return false;
    // Must not be expired
    if (row.userSub.expirationDate && new Date(row.userSub.expirationDate) < now) return false;
    return true;
  });

  if (!eligible) {
    return {
      eligible: false,
      userSubscription: null,
      subscription: null,
    };
  }

  return {
    eligible: true,
    userSubscription: eligible.userSub,
    subscription: eligible.subscription,
  };
}

/**
 * Check full guest eligibility for a user, combining:
 * - Open Lab membership eligibility
 * - Guest credit availability for the current billing cycle
 *
 * Returns a GuestEligibilityResult with eligible status, available credits, and reason if not eligible.
 */
export async function checkGuestEligibility(
  userId: string
): Promise<GuestEligibilityResult> {
  // Step 1: Check base Open Lab eligibility
  const eligibility = await isUserOpenLabEligible(userId);

  if (!eligibility.eligible || !eligibility.userSubscription) {
    return {
      eligible: false,
      creditsAvailable: 0,
      reason: 'No tienes una membresía Open Lab activa.',
    };
  }

  // Step 2: Check guest credits for the current billing cycle
  // Each billing cycle allows 1 guest credit. We check how many have been used.
  const creditsUsed = await db
    .select({ creditsUsed: guestCredits.creditsUsed })
    .from(guestCredits)
    .where(
      and(
        eq(guestCredits.userId, userId),
        eq(guestCredits.userSubscriptionId, eligibility.userSubscription.id)
      )
    );

  // Sum up all credits used for this subscription cycle
  const totalUsed = creditsUsed.reduce((sum, row) => sum + row.creditsUsed, 0);
  const creditsAvailable = Math.max(0, 1 - totalUsed);

  if (creditsAvailable <= 0) {
    return {
      eligible: false,
      creditsAvailable: 0,
      reason: 'Ya utilizaste tu crédito de invitado en este ciclo.',
    };
  }

  return {
    eligible: true,
    creditsAvailable,
  };
}
