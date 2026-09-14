import { db } from '@/db';
import { openClasses, users, classEnrollments, guestEnrollments } from '@/db/schema';
import { eq, and, gte, lte, count, inArray, notInArray } from 'drizzle-orm';
import { ScheduleClient } from './ScheduleClient';
import { getClassDisplayName } from '@/lib/utils/class-type';
import { formatTimeWithMeridiem } from '@/lib/utils/date';
import { getRollingWeekRange, getRollingDayIndex, getRollingDays } from './schedule-utils';

/**
 * Renders a class time range in America/Mexico_City (single-hour duration).
 * e.g. "07:00 P.M. - 08:00 P.M."
 */
function formatClassTimeRange(classStart: Date): string {
  const classEnd = new Date(classStart.getTime() + 60 * 60 * 1000);
  return `${formatTimeWithMeridiem(classStart)} - ${formatTimeWithMeridiem(classEnd)}`;
}

export interface WeekClass {
  id: string;
  time: string;
  classType: string;
  coachName: string;
  dayIndex: number; // 0 = today ... 6 = today + 6
  spotsLeft: number;
}

export default async function Schedule() {
  const now = new Date();
  const { start, end } = getRollingWeekRange(now);

  // Scheduled classes within the rolling window, excluding ones that already started.
  const weekClasses = await db
    .select({
      id: openClasses.id,
      classDate: openClasses.classDate,
      classType: openClasses.classType,
      customName: openClasses.customName,
      coachName: users.username,
      capacity: openClasses.capacity,
    })
    .from(openClasses)
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(
      and(
        eq(openClasses.status, 'scheduled'),
        gte(openClasses.classDate, now),
        lte(openClasses.classDate, end)
      )
    )
    .orderBy(openClasses.classDate);

  // Occupancy per class (holders + guests, excluding cancelled/late_cancelled).
  const classIds = weekClasses.map((cls) => cls.id);
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

  const formattedClasses: WeekClass[] = weekClasses.map((cls) => {
    const date = cls.classDate ? new Date(cls.classDate) : new Date();

    const capacity = cls.capacity ?? 0;
    const occupied = occupiedByClass.get(cls.id) ?? 0;

    return {
      id: cls.id,
      time: formatClassTimeRange(date),
      classType: getClassDisplayName(cls.classType ?? null, cls.customName ?? null),
      coachName: cls.coachName ?? 'Instructor',
      dayIndex: getRollingDayIndex(date, start),
      spotsLeft: Math.max(0, capacity - occupied),
    };
  });

  return (
    <ScheduleClient
      classes={formattedClasses}
      days={getRollingDays(start)}
      currentDayIndex={0}
    />
  );
}
