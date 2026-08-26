import { and, eq, lt, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { openClasses } from '@/db/schema';
import { checkAndExpireSubscriptions } from '@/lib/queries/check-subscription-expiration';

/**
 * Auto-completes classes that have passed their scheduled time plus a 1-hour buffer.
 * Only targets classes with status 'scheduled' — cancelled and already-completed classes
 * are never modified.
 *
 * After marking classes as completed, checks whether any linked subscriptions
 * should be expired (daysRemaining = 0 and all active enrollments in completed classes).
 *
 * @returns The number of classes that were transitioned to 'completed'.
 */
export async function autoCompletePassedClasses(): Promise<number> {
  // 1 hour buffer after classDate (classes last ~1 hour)
  const bufferTime = new Date(Date.now() - 60 * 60 * 1000);

  // Step 1: Query the IDs of classes that should be auto-completed
  const classesToComplete = await db
    .select({ id: openClasses.id })
    .from(openClasses)
    .where(
      and(
        eq(openClasses.status, 'scheduled'),
        lt(openClasses.classDate, bufferTime)
      )
    );

  if (classesToComplete.length === 0) {
    return 0;
  }

  const classIds = classesToComplete.map((c) => c.id);

  // Step 2: Bulk update those classes to 'completed'
  await db
    .update(openClasses)
    .set({ status: 'completed' })
    .where(inArray(openClasses.id, classIds));

  // Step 3: Check subscription expiration for each newly completed class
  for (const classId of classIds) {
    await checkAndExpireSubscriptions(classId);
  }

  return classIds.length;
}
