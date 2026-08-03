import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '@/db';
import { openClasses, classEnrollments, userSubscriptions, users } from '@/db/schema';

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
 */
export async function getCoachClassById(classId: string, coachUserId: string) {
  return db.query.openClasses.findFirst({
    where: and(
      eq(openClasses.id, classId),
      eq(openClasses.coachUserId, coachUserId)
    ),
  });
}

/**
 * Fetches enrollments for a class with the student's user info.
 */
export async function getClassEnrollments(classId: string) {
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
    .where(eq(classEnrollments.openClassId, classId));
}
