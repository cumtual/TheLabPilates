import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { openClasses, classEnrollments, guestEnrollments } from '@/db/schema';
import { eq, and, gte, desc, count, inArray, notInArray } from 'drizzle-orm';
import { ClassCalendar } from '@/components/coach/ClassCalendar';
import Link from 'next/link';
import { autoCompletePassedClasses } from '@/lib/queries/class-auto-completion';

export default async function CoachClassesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Auto-complete past scheduled classes (lazy evaluation - secondary mechanism)
  await autoCompletePassedClasses();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch ALL classes for this coach (client handles filters + pagination)
  const classes = await db
    .select()
    .from(openClasses)
    .where(
      and(
        eq(openClasses.coachUserId, session.sub),
        gte(openClasses.classDate, thirtyDaysAgo)
      )
    )
    .orderBy(desc(openClasses.classDate));

  // Occupancy per class (holders + guests, excluding cancelled/late_cancelled).
  const classIds = classes.map((cls) => cls.id);
  const occupiedByClass = new Map<string, number>();

  if (classIds.length > 0) {
    const excludedStatuses: ('cancelled' | 'late_cancelled')[] = [
      'cancelled',
      'late_cancelled',
    ];

    const enrollmentRows = await db
      .select({
        classId: classEnrollments.openClassId,
        total: count(classEnrollments.id),
      })
      .from(classEnrollments)
      .where(
        and(
          inArray(classEnrollments.openClassId, classIds),
          notInArray(classEnrollments.status, excludedStatuses)
        )
      )
      .groupBy(classEnrollments.openClassId);

    const guestRows = await db
      .select({
        classId: guestEnrollments.openClassId,
        total: count(guestEnrollments.id),
      })
      .from(guestEnrollments)
      .where(
        and(
          inArray(guestEnrollments.openClassId, classIds),
          notInArray(guestEnrollments.status, excludedStatuses)
        )
      )
      .groupBy(guestEnrollments.openClassId);

    for (const row of enrollmentRows) {
      occupiedByClass.set(row.classId, row.total);
    }
    for (const row of guestRows) {
      occupiedByClass.set(row.classId, (occupiedByClass.get(row.classId) ?? 0) + row.total);
    }
  }

  const occupiedCounts: Record<string, number> = {};
  for (const [classId, total] of occupiedByClass) {
    occupiedCounts[classId] = total;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 py-6">
        <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg text-on-surface">
          Mis Clases
        </h1>
        <Link
          href="/coach/classes/new"
          className="inline-flex items-center justify-center px-4 py-2 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
        >
          + Nueva Clase
        </Link>
      </div>
      <ClassCalendar
        classes={classes}
        currentUserId={session.sub}
        occupiedByClass={occupiedCounts}
      />
    </div>
  );
}
