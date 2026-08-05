import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/db';
import { openClasses } from '@/db/schema';

/**
 * Auto-completes classes that have passed their scheduled time plus a 1-hour buffer.
 * Only targets classes with status 'scheduled' — cancelled and already-completed classes
 * are never modified.
 *
 * @returns The number of classes that were transitioned to 'completed'.
 */
export async function autoCompletePassedClasses(): Promise<number> {
  // 1 hour buffer after classDate (classes last ~1 hour)
  const bufferTime = new Date(Date.now() - 60 * 60 * 1000);

  const result = await db
    .update(openClasses)
    .set({ status: 'completed' })
    .where(
      and(
        eq(openClasses.status, 'scheduled'),
        lt(openClasses.classDate, bufferTime)
      )
    );

  return (result as unknown as { count: number })?.count ?? 0;
}
