import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { openClasses } from '@/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { ClassCalendar } from '@/components/coach/ClassCalendar';
import Link from 'next/link';

export default async function CoachClassesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

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
      <ClassCalendar classes={classes} />
    </div>
  );
}
