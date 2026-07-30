import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getCoachClassById, getClassEnrollments } from '@/lib/queries/coach';
import { AttendanceSheet } from '@/components/coach/AttendanceSheet';
import { Card } from '@/components/ui/Card';

const classTypeLabels: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { classId } = await params;

  const openClass = await getCoachClassById(classId, session.sub);

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

  const typeLabel = classTypeLabels[openClass.classType ?? ''] ?? openClass.classType ?? 'Clase';
  const dateFormatted = openClass.classDate
    ? new Date(openClass.classDate).toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sin fecha';

  return (
    <div>
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
        />
      )}
    </div>
  );
}
