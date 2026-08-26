import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getCoachClassById, getClassEnrollments, getCancelledEnrollments, getClassGuestEnrollments, getCancelledGuestEnrollments } from '@/lib/queries/coach';
import { getClassDisplayName } from '@/lib/utils/class-type';
import { AttendanceSheet } from '@/components/coach/AttendanceSheet';
import { Card } from '@/components/ui/Card';
import { GuestBadge } from '@/components/coach/GuestBadge';
import { GuestTooltip } from '@/components/coach/GuestTooltip';

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Allow both coaches and admins to access this page
  if (session.role !== 'coach' && session.role !== 'admin') {
    redirect('/login');
  }

  const { classId } = await params;
  const isAdmin = session.role === 'admin';

  const openClass = await getCoachClassById(classId, session.sub, isAdmin);

  if (!openClass) {
    return (
      <div>
        <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg text-on-surface mb-6">
          Asistencia
        </h1>
        <Card>
          <p className="font-body text-on-surface-variant text-center py-8">
            Clase no encontrada o no tienes permisos para verla.
          </p>
        </Card>
      </div>
    );
  }

  const isFutureClass = openClass.classDate
    ? new Date(openClass.classDate) > new Date()
    : false;

  const enrollments = await getClassEnrollments(classId);
  const cancelledEnrollments = await getCancelledEnrollments(classId);
  const guestEnrollments = await getClassGuestEnrollments(classId);
  const cancelledGuestEnrollments = await getCancelledGuestEnrollments(classId);

  // Build a combined list: each titular enrollment followed by their guest (if any)
  type AttendanceEntry =
    | { type: 'enrollment'; data: typeof enrollments[number] }
    | { type: 'guest'; data: typeof guestEnrollments[number] };

  const orderedEntries: AttendanceEntry[] = [];
  const guestsByRegisteredBy = new Map<string, typeof guestEnrollments>();
  for (const guest of guestEnrollments) {
    const existing = guestsByRegisteredBy.get(guest.registeredById) ?? [];
    existing.push(guest);
    guestsByRegisteredBy.set(guest.registeredById, existing);
  }

  // Place each enrollment followed by their registered guests
  const placedGuestIds = new Set<string>();
  for (const enrollment of enrollments) {
    orderedEntries.push({ type: 'enrollment', data: enrollment });
    const guests = guestsByRegisteredBy.get(enrollment.userId) ?? [];
    for (const guest of guests) {
      orderedEntries.push({ type: 'guest', data: guest });
      placedGuestIds.add(guest.guestEnrollmentId);
    }
  }

  // Add any remaining guests not linked to an active enrollment (e.g., admin-added guests)
  for (const guest of guestEnrollments) {
    if (!placedGuestIds.has(guest.guestEnrollmentId)) {
      orderedEntries.push({ type: 'guest', data: guest });
    }
  }

  const typeLabel = getClassDisplayName(openClass.classType, openClass.customName);
  const dateFormatted = openClass.classDate
    ? new Date(openClass.classDate).toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sin fecha';

  return (
    <div className='py-6'>
      <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">
        Asistencia
      </h1>
      <p className="font-body text-sm text-on-surface-variant mb-6 capitalize">
        {typeLabel} — {dateFormatted}
      </p>

      {isFutureClass ? (
        <>
          <Card className="mb-4 bg-warm-wood/10 border-warm-wood/30">
            <p className="font-body text-sm text-secondary font-medium">
              Esta clase aún no ocurre. Puedes ver los alumnos inscritos, pero no registrar asistencia hasta que la fecha de clase haya pasado.
            </p>
          </Card>
          {orderedEntries.length === 0 ? (
            <Card>
              <p className="font-body text-on-surface-variant text-center py-8">
                No hay alumnos inscritos en esta clase.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              <p className="font-body text-sm text-on-surface-variant mb-3">
                {enrollments.length} alumno{enrollments.length !== 1 ? 's' : ''} inscrito{enrollments.length !== 1 ? 's' : ''}
                {guestEnrollments.length > 0 && ` + ${guestEnrollments.length} invitado${guestEnrollments.length !== 1 ? 's' : ''}`}
              </p>
              {orderedEntries.map((entry) =>
                entry.type === 'enrollment' ? (
                  <Card key={entry.data.enrollmentId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm font-semibold text-on-surface truncate">
                        {entry.data.studentName}
                      </p>
                      <p className="font-body text-xs text-on-surface-variant truncate">
                        {entry.data.studentEmail}
                      </p>
                    </div>
                    <span className="font-body text-xs text-outline px-2 py-1 bg-surface-container-low rounded">
                      Pendiente
                    </span>
                  </Card>
                ) : (
                  <Card key={entry.data.guestEnrollmentId} className="flex items-center gap-3 ml-4 border-l-2 border-primary/20">
                    <div className="flex-1 min-w-0">
                      <GuestTooltip
                        origin={entry.data.origin}
                        registeredByName={entry.data.registeredByName ?? undefined}
                        registeredByEmail={entry.data.registeredByEmail ?? undefined}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-body text-sm font-semibold text-on-surface truncate">
                            {entry.data.guestName}
                          </p>
                          <GuestBadge
                            guestName={entry.data.guestName}
                            origin={entry.data.origin}
                          />
                        </div>
                      </GuestTooltip>
                    </div>
                    <span className="font-body text-xs text-outline px-2 py-1 bg-surface-container-low rounded">
                      Pendiente
                    </span>
                  </Card>
                )
              )}
            </div>
          )}
        </>
      ) : orderedEntries.length === 0 ? (
        <Card>
          <p className="font-body text-on-surface-variant text-center py-8">
            No hay alumnos inscritos en esta clase.
          </p>
        </Card>
      ) : (
        <AttendanceSheet
          classId={classId}
          enrollments={enrollments}
          guestEnrollments={guestEnrollments}
          isCompleted={openClass.status === 'completed'}
        />
      )}

      {/* Sección de cancelaciones */}
      {(cancelledEnrollments.length > 0 || cancelledGuestEnrollments.length > 0) && (
        <div className="mt-8">
          <h2 className="font-headline text-title-md text-on-surface-variant mb-3">
            Cancelaciones ({cancelledEnrollments.length + cancelledGuestEnrollments.length})
          </h2>
          <div className="space-y-2">
            {cancelledEnrollments.map((enrollment) => (
              <Card key={enrollment.enrollmentId} className="flex items-center gap-3 opacity-70">
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm font-semibold text-on-surface truncate">
                    {enrollment.studentName}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant truncate">
                    {enrollment.studentEmail}
                  </p>
                </div>
                <span className={`font-body text-xs px-2 py-1 rounded ${
                  enrollment.status === 'late_cancelled'
                    ? 'bg-error/10 text-error'
                    : 'bg-surface-container-low text-outline'
                }`}>
                  {enrollment.status === 'late_cancelled' ? 'Cancelación tardía' : 'Canceló'}
                </span>
              </Card>
            ))}
            {cancelledGuestEnrollments.map((guest) => (
              <Card key={guest.guestEnrollmentId} className="flex items-center gap-3 opacity-70 ml-4 border-l-2 border-primary/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-body text-sm font-semibold text-on-surface truncate">
                      {guest.guestName}
                    </p>
                    <GuestBadge guestName={guest.guestName} origin={guest.origin} />
                  </div>
                </div>
                <span className={`font-body text-xs px-2 py-1 rounded ${
                  guest.status === 'late_cancelled'
                    ? 'bg-error/10 text-error'
                    : 'bg-surface-container-low text-outline'
                }`}>
                  {guest.status === 'late_cancelled' ? 'Cancelación tardía' : 'Canceló'}
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
