import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { classEnrollments, userSubscriptions } from '@/db/schema';

export interface OwnEnrollmentCheckinStatus {
  status: (typeof classEnrollments.$inferSelect)['status'];
  checkedInAt: Date | null;
}

/**
 * Estado de check-in de una reserva del propio usuario. Devuelve `null` si no
 * existe o si pertenece a otro usuario (no se distinguen, evita enumeración).
 */
export async function getOwnEnrollmentCheckinStatus(
  enrollmentId: string,
  userId: string
): Promise<OwnEnrollmentCheckinStatus | null> {
  const [row] = await db
    .select({ status: classEnrollments.status, checkedInAt: classEnrollments.checkedInAt })
    .from(classEnrollments)
    .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
    .where(and(eq(classEnrollments.id, enrollmentId), eq(userSubscriptions.userId, userId)))
    .limit(1);

  return row ?? null;
}
