import { eq, desc, and, gte, notInArray, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { openClasses, classEnrollments, userSubscriptions, users, guestEnrollments } from '@/db/schema';

/**
 * Fetches classes owned by a specific coach, filtered to the last 30 days,
 * sorted by class_date descending.
 */
export async function getCoachClasses(coachUserId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return db
    .select()
    .from(openClasses)
    .where(
      and(
        eq(openClasses.coachUserId, coachUserId),
        gte(openClasses.classDate, thirtyDaysAgo)
      )
    )
    .orderBy(desc(openClasses.classDate));
}

/**
 * Fetches a class by ID, verifying it belongs to the coach.
 * If isAdmin is true, skips the coach ownership check (admin can see any class).
 */
export async function getCoachClassById(classId: string, coachUserId: string, isAdmin = false) {
  if (isAdmin) {
    return db.query.openClasses.findFirst({
      where: eq(openClasses.id, classId),
    });
  }
  return db.query.openClasses.findFirst({
    where: and(
      eq(openClasses.id, classId),
      eq(openClasses.coachUserId, coachUserId)
    ),
  });
}

/**
 * Fetches enrollments for a class with the student's user info.
 * Excludes cancelled and late_cancelled enrollments.
 */
export async function getClassEnrollments(classId: string) {
  return db
    .select({
      enrollmentId: classEnrollments.id,
      status: classEnrollments.status,
      studentName: users.username,
      studentEmail: users.email,
      userId: userSubscriptions.userId,
    })
    .from(classEnrollments)
    .innerJoin(
      userSubscriptions,
      eq(classEnrollments.userSubscriptionId, userSubscriptions.id)
    )
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .where(
      and(
        eq(classEnrollments.openClassId, classId),
        notInArray(classEnrollments.status, ['cancelled', 'late_cancelled'])
      )
    );
}

/**
 * Fetches cancelled enrollments for a class (cancelled + late_cancelled).
 * Used to show coaches/admin who dropped out of the class.
 */
export async function getCancelledEnrollments(classId: string) {
  return db
    .select({
      enrollmentId: classEnrollments.id,
      status: classEnrollments.status,
      studentName: users.username,
      studentEmail: users.email,
    })
    .from(classEnrollments)
    .innerJoin(
      userSubscriptions,
      eq(classEnrollments.userSubscriptionId, userSubscriptions.id)
    )
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .where(
      and(
        eq(classEnrollments.openClassId, classId),
        inArray(classEnrollments.status, ['cancelled', 'late_cancelled'])
      )
    );
}


/**
 * Fetches guest enrollments for a class with the registeredBy user's info.
 * Excludes cancelled and late_cancelled guests.
 * Returns guest name, origin, status, and the registeredBy user's name/email.
 */
export async function getClassGuestEnrollments(classId: string) {
  return db
    .select({
      guestEnrollmentId: guestEnrollments.id,
      guestName: guestEnrollments.guestName,
      origin: guestEnrollments.origin,
      status: guestEnrollments.status,
      registeredById: guestEnrollments.registeredById,
      registeredByName: users.username,
      registeredByEmail: users.email,
    })
    .from(guestEnrollments)
    .leftJoin(users, eq(guestEnrollments.registeredById, users.id))
    .where(
      and(
        eq(guestEnrollments.openClassId, classId),
        notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
      )
    );
}

/**
 * Fetches cancelled guest enrollments for a class (cancelled + late_cancelled).
 * Used to show coaches who dropped out.
 */
export async function getCancelledGuestEnrollments(classId: string) {
  return db
    .select({
      guestEnrollmentId: guestEnrollments.id,
      guestName: guestEnrollments.guestName,
      origin: guestEnrollments.origin,
      status: guestEnrollments.status,
      registeredById: guestEnrollments.registeredById,
      registeredByName: users.username,
      registeredByEmail: users.email,
    })
    .from(guestEnrollments)
    .leftJoin(users, eq(guestEnrollments.registeredById, users.id))
    .where(
      and(
        eq(guestEnrollments.openClassId, classId),
        inArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
      )
    );
}
