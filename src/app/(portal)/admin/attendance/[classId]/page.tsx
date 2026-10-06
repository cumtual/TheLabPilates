import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getCoachClassById, getClassEnrollments, getClassGuestEnrollments } from '@/lib/queries/coach';
import { getClassEnrollmentAudit } from '@/lib/queries/admin-enrollment-audit';
import { getClassDisplayName } from '@/lib/utils/class-type';
import { formatFullDateTime, getMexicoCityDayBounds } from '@/lib/utils/date';
import { AttendanceSheet } from '@/components/coach/AttendanceSheet';
import { AdminGuestSection } from '@/components/admin/AdminGuestSection';
import { CancellationAuditList } from '@/components/admin/CancellationAuditList';
import { Card } from '@/components/ui/Card';

export default async function AdminAttendancePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  const { classId } = await params;

  const openClass = await getCoachClassById(classId, session.sub, true);

  if (!openClass) {
    return (
      <div>
        <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg text-on-surface mb-6">
          Asistencia
        </h1>
        <Card>
          <p className="font-body text-on-surface-variant text-center py-8">
            Clase no encontrada.
          </p>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const dayBounds = openClass.classDate
    ? getMexicoCityDayBounds(openClass.classDate)
    : null;
  const isFutureClass = dayBounds ? now < dayBounds.start : false;
  const attendanceClosed = dayBounds ? now > dayBounds.end : false;

  const [activeEnrollments, guestEnrollments, audit] = await Promise.all([
    getClassEnrollments(classId),
    getClassGuestEnrollments(classId),
    // Timestamps de reserva/cancelación: solo admin (SPEC-CANCELLATION-AUDIT-AND-TERMS §3.5).
    getClassEnrollmentAudit(classId, session),
  ]);

  const bookedAtById = new Map(audit.map((row) => [row.enrollmentId, row.bookedAt]));
  const enrollments = activeEnrollments.map((e) => ({
    ...e,
    bookedAtLabel: bookedAtById.get(e.enrollmentId),
  }));

  // Map guest data to the shape expected by AdminGuestSection
  const guestData = guestEnrollments.map((g) => ({
    id: g.guestEnrollmentId,
    guestName: g.guestName,
    origin: g.origin as 'user' | 'admin',
    status: g.status as 'pending' | 'attended' | 'absent' | 'late_cancelled' | 'cancelled',
    registeredById: g.registeredById,
    registeredByName: g.registeredByName,
    bookedAtLabel: bookedAtById.get(g.guestEnrollmentId),
  }));

  const typeLabel = getClassDisplayName(openClass.classType, openClass.customName);
  const dateFormatted = openClass.classDate
    ? formatFullDateTime(new Date(openClass.classDate))
    : 'Sin fecha';

  return (
    <div className="py-6">
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
          {enrollments.length === 0 ? (
            <Card>
              <p className="font-body text-on-surface-variant text-center py-8">
                No hay alumnos inscritos en esta clase.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              <p className="font-body text-sm text-on-surface-variant mb-3">
                {enrollments.length} alumno{enrollments.length !== 1 ? 's' : ''} inscrito{enrollments.length !== 1 ? 's' : ''}
              </p>
              {enrollments.map((enrollment) => (
                <Card key={enrollment.enrollmentId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm font-semibold text-on-surface truncate">
                      {enrollment.studentName}
                    </p>
                    <p className="font-body text-xs text-on-surface-variant truncate">
                      {enrollment.studentEmail}
                    </p>
                    {enrollment.bookedAtLabel && (
                      <p className="font-body text-xs text-outline truncate">
                        Reservó: {enrollment.bookedAtLabel}
                      </p>
                    )}
                  </div>
                  <span className="font-body text-xs text-outline px-2 py-1 bg-surface-container-low rounded">
                    Pendiente
                  </span>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : enrollments.length === 0 ? (
        <Card>
          <p className="font-body text-on-surface-variant text-center py-8">
            No hay alumnos inscritos en esta clase.
          </p>
        </Card>
      ) : (
        <AttendanceSheet
          classId={classId}
          enrollments={enrollments}
          isCompleted={openClass.status === 'completed'}
          attendanceClosed={attendanceClosed}
        />
      )}

      {/* Sección de gestión de invitados */}
      <div className="mt-8">
        <AdminGuestSection classId={classId} guests={guestData} />
      </div>

      {/* Historial de cancelaciones con fecha de reserva y de cancelación (solo admin) */}
      <CancellationAuditList rows={audit} />
    </div>
  );
}
