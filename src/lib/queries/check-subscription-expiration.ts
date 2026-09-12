import { eq, and, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { classEnrollments, openClasses, userSubscriptions, payments, subscriptions } from '@/db/schema';

/**
 * Check and expire subscriptions after a class is completed.
 *
 * Given a classId that was just marked as 'completed', this function:
 * 1. Finds all active enrollments (not cancelled/late_cancelled) for that class
 * 2. For each linked subscription, checks if the expiration condition is met:
 *    - subscription.active = true
 *    - subscription.daysRemaining = 0
 *    - payment is confirmed
 *    - ALL active enrollments (across all classes) are linked to completed classes
 * 3. If conditions met, marks the subscription as expired (active=false, status='expired')
 *
 * Uses a transaction for atomicity.
 */
export async function checkAndExpireSubscriptions(classId: string): Promise<void> {
  const cancelledStatuses = ['cancelled', 'late_cancelled'] as const;

  await db.transaction(async (tx) => {
    // Step 1: Find all active enrollments for the completed class
    const enrollmentsForClass = await tx
      .select({
        userSubscriptionId: classEnrollments.userSubscriptionId,
      })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.openClassId, classId),
          notInArray(classEnrollments.status, [...cancelledStatuses])
        )
      );

    if (enrollmentsForClass.length === 0) {
      return;
    }

    // Get unique subscription IDs
    const uniqueSubscriptionIds = Array.from(
      new Set(enrollmentsForClass.map((e) => e.userSubscriptionId))
    );

    // Step 2: For each subscription, check expiration conditions
    for (const subId of uniqueSubscriptionIds) {
      // Load subscription
      const subscription = await tx.query.userSubscriptions.findFirst({
        where: eq(userSubscriptions.id, subId),
      });

      if (!subscription) continue;

      const plan = await tx.query.subscriptions.findFirst({
        where: eq(subscriptions.id, subscription.subscriptionId),
      });
      const isOpenLab = plan?.guest === true;
      const isTimeExpired =
        subscription.expirationDate != null &&
        new Date(subscription.expirationDate) < new Date();

      // Suspended subscriptions (active = false) must remain untouched.
      if (!subscription.active) continue;

      // Month ended: any plan (Open Lab or credit-based) expires.
      if (isTimeExpired) {
        await tx
          .update(userSubscriptions)
          .set({ active: false, status: 'expired', expirationDate: new Date() })
          .where(eq(userSubscriptions.id, subId));
        continue;
      }

      // Open Lab is unlimited and time-bound only — never expired by credit exhaustion.
      if (isOpenLab) continue;

      // Credit packages require exhausted credits (0) to be considered for expiration.
      if ((subscription.daysRemaining ?? 0) !== 0) {
        continue;
      }

      // Check payment is confirmed
      const payment = await tx.query.payments.findFirst({
        where: eq(payments.id, subscription.paymentId),
      });

      if (!payment || !payment.confirmed) {
        continue;
      }

      // Step 3: Get ALL active enrollments for this subscription (across all classes)
      const allActiveEnrollments = await tx
        .select({
          enrollmentId: classEnrollments.id,
          openClassId: classEnrollments.openClassId,
        })
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.userSubscriptionId, subId),
            notInArray(classEnrollments.status, [...cancelledStatuses])
          )
        );

      // If no active enrollments at all, the subscription is exhausted with no pending classes
      // This also satisfies the bug condition (vacuously all completed)
      if (allActiveEnrollments.length === 0) {
        await tx
          .update(userSubscriptions)
          .set({ active: false, status: 'expired', expirationDate: new Date() })
          .where(eq(userSubscriptions.id, subId));
        continue;
      }

      // Step 4: Check if every active enrollment is linked to a completed class
      let allCompleted = true;
      for (const enrollment of allActiveEnrollments) {
        const openClass = await tx.query.openClasses.findFirst({
          where: eq(openClasses.id, enrollment.openClassId),
        });

        if (!openClass || openClass.status !== 'completed') {
          allCompleted = false;
          break;
        }
      }

      // Step 5: If all conditions met, expire the subscription
      if (allCompleted) {
        await tx
          .update(userSubscriptions)
          .set({ active: false, status: 'expired', expirationDate: new Date() })
          .where(eq(userSubscriptions.id, subId));
      }
    }
  });
}
