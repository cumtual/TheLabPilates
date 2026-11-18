import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { guestEnrollments, openClasses, users } from '@/db/schema';
import type {
  GuestAutoCloseRepository,
  GuestCheckinRepository,
  GuestCheckinUnitOfWork,
  GuestQrReader,
} from '../application/ports';

/** Repositorios Drizzle del check-in de invitados (SPEC-GUEST-QR-CHECKIN §5.3). */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function createGuestCheckinRepository(tx: Transaction): GuestCheckinRepository {
  return {
    async findByTokenForUpdate(token) {
      const [row] = await tx
        .select({
          guestEnrollmentId: guestEnrollments.id,
          status: guestEnrollments.status,
          guestName: guestEnrollments.guestName,
          invitedByName: users.username,
          classDate: openClasses.classDate,
          classStatus: openClasses.status,
          coachUserId: openClasses.coachUserId,
          classType: openClasses.classType,
          customName: openClasses.customName,
        })
        .from(guestEnrollments)
        .innerJoin(openClasses, eq(guestEnrollments.openClassId, openClasses.id))
        .leftJoin(users, eq(guestEnrollments.registeredById, users.id))
        .where(eq(guestEnrollments.checkinToken, token))
        .limit(1)
        .for('update', { of: guestEnrollments });

      return row ?? null;
    },

    async markAttended({ guestEnrollmentId, token, actorId }) {
      const [updated] = await tx
        .update(guestEnrollments)
        .set({ status: 'attended', checkedInAt: sql`now()`, checkedInById: actorId, checkinToken: null })
        .where(
          and(
            eq(guestEnrollments.id, guestEnrollmentId),
            eq(guestEnrollments.status, 'pending'),
            eq(guestEnrollments.checkinToken, token)
          )
        )
        .returning({ checkedInAt: guestEnrollments.checkedInAt });

      return updated?.checkedInAt ?? null;
    },
  };
}

export const drizzleGuestCheckinUnitOfWork: GuestCheckinUnitOfWork = {
  run: (work) => db.transaction((tx) => work(createGuestCheckinRepository(tx))),
};

export const drizzleGuestQrReader: GuestQrReader = {
  async findById(guestEnrollmentId) {
    const [row] = await db
      .select({
        guestEnrollmentId: guestEnrollments.id,
        guestName: guestEnrollments.guestName,
        origin: guestEnrollments.origin,
        status: guestEnrollments.status,
        checkinToken: guestEnrollments.checkinToken,
        classType: openClasses.classType,
        customName: openClasses.customName,
        classDate: openClasses.classDate,
      })
      .from(guestEnrollments)
      .innerJoin(openClasses, eq(guestEnrollments.openClassId, openClasses.id))
      .where(eq(guestEnrollments.id, guestEnrollmentId))
      .limit(1);

    return row ?? null;
  },
};

export function buildGuestAutoCloseWhere({ from, cutoff }: { from: Date; cutoff: Date }) {
  return and(
    eq(guestEnrollments.openClassId, openClasses.id),
    eq(guestEnrollments.status, 'pending'),
    // Nunca clases canceladas: sus invitados siguen el flujo de cancelación.
    inArray(openClasses.status, ['scheduled', 'completed']),
    gte(openClasses.classDate, from),
    lt(openClasses.classDate, cutoff)
  );
}

/** Una sola sentencia UPDATE … FROM: atómica e idempotente. */
export const drizzleGuestAutoClose: GuestAutoCloseRepository = {
  async markUnattendedAbsent(range) {
    const closed = await db
      .update(guestEnrollments)
      .set({ status: 'absent', checkinToken: null })
      .from(openClasses)
      .where(buildGuestAutoCloseWhere(range))
      .returning({ id: guestEnrollments.id });

    return closed.length;
  },
};
