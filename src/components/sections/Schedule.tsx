import { db } from '@/db';
import { openClasses, users } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { ScheduleClient } from './ScheduleClient';

function getWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday...
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function getCurrentDayIndex(): number {
  const day = new Date().getDay(); // 0=Sunday
  if (day === 0) return 6; // Sunday = index 6
  return day - 1; // Mon=0, Tue=1, ... Sat=5
}

export interface WeekClass {
  id: string;
  time: string;
  classType: string;
  coachName: string;
  dayIndex: number; // 0=Monday ... 6=Sunday
}

export default async function Schedule() {
  const { monday, sunday } = getWeekRange();

  const weekClasses = await db
    .select({
      id: openClasses.id,
      classDate: openClasses.classDate,
      classType: openClasses.classType,
      coachName: users.username,
    })
    .from(openClasses)
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(
      and(
        eq(openClasses.status, 'scheduled'),
        gte(openClasses.classDate, monday),
        lte(openClasses.classDate, sunday)
      )
    )
    .orderBy(openClasses.classDate);

  const classTypeLabels: Record<string, string> = {
    yoga: 'Hatha Yoga',
    mat_pilates: 'Mat Pilates',
    barre: 'Barre',
  };

  const formattedClasses: WeekClass[] = weekClasses.map((cls) => {
    const date = cls.classDate ? new Date(cls.classDate) : new Date();
    const dayOfWeek = date.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const endHour = (date.getHours() + 1).toString().padStart(2, '0');

    return {
      id: cls.id,
      time: `${hours}:${minutes} - ${endHour}:${minutes}`,
      classType: classTypeLabels[cls.classType ?? ''] ?? cls.classType ?? 'Clase',
      coachName: cls.coachName ?? 'Instructor',
      dayIndex,
    };
  });

  return <ScheduleClient classes={formattedClasses} currentDayIndex={getCurrentDayIndex()} />;
}
