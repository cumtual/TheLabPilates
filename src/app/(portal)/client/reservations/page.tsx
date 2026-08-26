import { redirect } from 'next/navigation';
import { desc, and, eq, notInArray } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { classEnrollments, openClasses, userSubscriptions, users, guestEnrollments } from '@/db/schema';
import { ClientReservationsView } from '@/components/client/ClientReservationsView';
import { checkGuestEligibilityAction } from '@/actions/guest';
import { getAvailableCapacity } from '@/lib/guest/capacity';

export interface GuestInfo {
  guestEnrollmentId: string;
  guestName: string;
}

export interface ReservationHistoryItem {
  id: string;
  classId: string;
  classDate: string;
  classType: string | null;
  coachName: string | null;
  enrollmentStatus: string | null;
  /** Associated active guest enrollment, if any */
  guest: GuestInfo | null;
  /** Whether the class has available capacity (for AddGuestButton) */
  hasCapacity: boolean;
}

export default async function ClientReservationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  let reservations: ReservationHistoryItem[] = [];
  let error = false;
  let guestEligible = false;

  try {
    // Fetch ALL reservations for this user (client handles filters + pagination)
    const results = await db
      .select({
        enrollmentId: classEnrollments.id,
        classId: openClasses.id,
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

    // Check guest eligibility for the user (once, applies to all reservations)
    const eligibility = await checkGuestEligibilityAction();
    guestEligible = eligibility.eligible && eligibility.creditsAvailable > 0;

    // Fetch active guest enrollments for the user's classes
    const userGuestEnrollments = await db
      .select({
        id: guestEnrollments.id,
        openClassId: guestEnrollments.openClassId,
        guestName: guestEnrollments.guestName,
      })
      .from(guestEnrollments)
      .where(
        and(
          eq(guestEnrollments.registeredById, session.sub),
          notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
        )
      );

    // Create a map of classId -> guest info for quick lookup
    const guestByClassId = new Map<string, GuestInfo>();
    for (const g of userGuestEnrollments) {
      guestByClassId.set(g.openClassId, {
        guestEnrollmentId: g.id,
        guestName: g.guestName,
      });
    }

    // Get unique classIds for pending future reservations to check capacity
    const pendingFutureClassIds = results
      .filter(
        (r) =>
          r.enrollmentStatus === 'pending' &&
          r.classDate &&
          new Date(r.classDate) > new Date()
      )
      .map((r) => r.classId);

    const uniqueClassIds = [...new Set(pendingFutureClassIds)];

    // Fetch capacity for relevant classes (only pending future ones)
    const capacityMap = new Map<string, boolean>();
    await Promise.all(
      uniqueClassIds.map(async (classId) => {
        const available = await getAvailableCapacity(classId);
        capacityMap.set(classId, available >= 1);
      })
    );

    reservations = results.map((r) => ({
      id: r.enrollmentId,
      classId: r.classId,
      classDate: r.classDate?.toISOString() ?? new Date().toISOString(),
      classType: r.classType,
      coachName: r.coachName,
      enrollmentStatus: r.enrollmentStatus,
      guest: guestByClassId.get(r.classId) ?? null,
      hasCapacity: capacityMap.get(r.classId) ?? false,
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
        <ClientReservationsView reservations={reservations} guestEligible={guestEligible} />
      )}
    </div>
  );
}
