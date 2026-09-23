import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { classEnrollments, openClasses, userSubscriptions, users } from '@/db/schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CheckinCandidate {
  enrollmentId: string;
  status: (typeof classEnrollments.$inferSelect)['status'];
  classDate: Date | null;
  classStatus: (typeof openClasses.$inferSelect)['status'];
  coachUserId: string | null;
  classType: string | null;
  customName: string | null;
  studentName: string;
}

/** Acceso a datos del check-in; siempre se usa dentro de una transacción. */
export interface CheckinRepository {
  /** Busca la reserva por token y bloquea su fila hasta el fin de la transacción. */
  findByTokenForUpdate(token: string): Promise<CheckinCandidate | null>;
  /**
   * Marca `attended`, fija `checked_in_at = now()` y anula el token, solo si la
   * reserva sigue `pending` con ese token. Devuelve `checked_in_at` o `null`.
   */
  markAttended(enrollmentId: string, token: string): Promise<Date | null>;
}

export function createCheckinRepository(tx: Transaction): CheckinRepository {
  return {
    async findByTokenForUpdate(token) {
      const [row] = await tx
        .select({
          enrollmentId: classEnrollments.id,
          status: classEnrollments.status,
          classDate: openClasses.classDate,
          classStatus: openClasses.status,
          coachUserId: openClasses.coachUserId,
          classType: openClasses.classType,
          customName: openClasses.customName,
          studentName: users.username,
        })
        .from(classEnrollments)
        .innerJoin(openClasses, eq(classEnrollments.openClassId, openClasses.id))
        .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
        .innerJoin(users, eq(userSubscriptions.userId, users.id))
        .where(eq(classEnrollments.checkinToken, token))
        .limit(1)
        .for('update', { of: classEnrollments });

      return row ?? null;
    },

    async markAttended(enrollmentId, token) {
      const [updated] = await tx
        .update(classEnrollments)
        .set({ status: 'attended', checkedInAt: sql`now()`, checkinToken: null })
        .where(
          and(
            eq(classEnrollments.id, enrollmentId),
            eq(classEnrollments.status, 'pending'),
            eq(classEnrollments.checkinToken, token)
          )
        )
        .returning({ checkedInAt: classEnrollments.checkedInAt });

      return updated?.checkedInAt ?? null;
    },
  };
}

export function runCheckinTransaction<T>(
  work: (repository: CheckinRepository) => Promise<T>
): Promise<T> {
  return db.transaction((tx) => work(createCheckinRepository(tx)));
}
