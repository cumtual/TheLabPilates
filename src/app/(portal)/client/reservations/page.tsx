import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { classEnrollments, openClasses, userSubscriptions, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ClientReservationsView } from '@/components/client/ClientReservationsView';

export interface ReservationHistoryItem {
  id: string;
  classDate: string;
  classType: string | null;
  coachName: string | null;
  enrollmentStatus: string | null;
}

export default async function ClientReservationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  let reservations: ReservationHistoryItem[] = [];
  let error = false;

  try {
    // Fetch ALL reservations for this user (client handles filters + pagination)
    const results = await db
      .select({
        enrollmentId: classEnrollments.id,
        classDate: openClasses.classDate,
        classType: openClasses.classType,
        coachName: users.username,
        enrollmentStatus: classEnrollments.status,
      })
      .from(classEnrollments)
      .innerJoin(openClasses, eq(classEnrollments.openClassId, openClasses.id))
      .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
      .leftJoin(users, eq(openClasses.coachUserId, users.id))
      .where(eq(userSubscriptions.userId, session.sub))
      .orderBy(desc(openClasses.classDate));

    reservations = results.map((r) => ({
      id: r.enrollmentId,
      classDate: r.classDate?.toISOString() ?? new Date().toISOString(),
      classType: r.classType,
      coachName: r.coachName,
      enrollmentStatus: r.enrollmentStatus,
    }));
  } catch {
    error = true;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Mis Reservaciones</h1>

      {error ? (
        <div className="bg-error/10 border border-error/30 rounded-lg p-4 text-center">
          <p className="font-body text-sm text-error">
            No se pudieron cargar las reservaciones. Intenta de nuevo.
          </p>
          <a
            href="/client/reservations"
            className="inline-flex items-center justify-center mt-3 px-4 py-2 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
          >
            Reintentar
          </a>
        </div>
      ) : (
        <ClientReservationsView reservations={reservations} />
      )}
    </div>
  );
}
