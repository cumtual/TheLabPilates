import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getCoachClasses } from '@/lib/queries/coach';
import { ClassCalendar } from '@/components/coach/ClassCalendar';
import { autoCompletePassedClasses } from '@/lib/queries/class-auto-completion';
import { MyCourtesiesSection } from '@/components/cafeteria/MyCourtesiesSection';

export default async function CoachDashboard() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Auto-complete past scheduled classes (lazy evaluation - secondary mechanism)
  await autoCompletePassedClasses();

  const classes = await getCoachClasses(session.sub);

  return (
    <div>
      <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg text-on-surface mb-6 py-6">
        Mi Agenda
      </h1>
      {/* Cupo mensual y regalos de la cafetería (SPEC-CAFETERIA D12) */}
      <div className="mb-6">
        <MyCourtesiesSection />
      </div>
      <ClassCalendar classes={classes} />
    </div>
  );
}
