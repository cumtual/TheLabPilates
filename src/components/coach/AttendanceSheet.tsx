'use client';

import { useState, useTransition } from 'react';
import { updateAttendanceAction, completeClassAction } from '@/actions/coach';
import { Card } from '@/components/ui/Card';

interface EnrollmentRow {
  enrollmentId: string;
  status: string | null;
  studentName: string;
  studentEmail: string;
}

interface AttendanceSheetProps {
  classId: string;
  enrollments: EnrollmentRow[];
  isCompleted: boolean;
}

export function AttendanceSheet({
  classId,
  enrollments,
  isCompleted,
}: AttendanceSheetProps) {
  const [records, setRecords] = useState<
    Record<string, 'attended' | 'absent'>
  >(() => {
    const initial: Record<string, 'attended' | 'absent'> = {};
    for (const enrollment of enrollments) {
      if (enrollment.status === 'attended' || enrollment.status === 'absent') {
        initial[enrollment.enrollmentId] = enrollment.status;
      } else {
        initial[enrollment.enrollmentId] = 'attended';
      }
    }
    return initial;
  });

  const [isPending, startTransition] = useTransition();
  const [isCompleting, startCompleteTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classCompleted, setClassCompleted] = useState(isCompleted);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  function handleToggle(enrollmentId: string, status: 'attended' | 'absent') {
    setRecords((prev) => ({ ...prev, [enrollmentId]: status }));
  }

  function handleSubmit() {
    setMessage(null);
    setError(null);

    const attendanceRecords = Object.entries(records).map(
      ([enrollmentId, status]) => ({
        enrollmentId,
        status,
      })
    );

    startTransition(async () => {
      const result = await updateAttendanceAction(classId, attendanceRecords);
      if (result.success) {
        setMessage(result.message ?? 'Asistencia registrada exitosamente.');
      } else {
        setError(result.error);
      }
    });
  }

  function handleCompleteClass() {
    setMessage(null);
    setError(null);
    setShowCompleteConfirm(false);

    startCompleteTransition(async () => {
      const result = await completeClassAction(classId);
      if (result.success) {
        setClassCompleted(true);
        setMessage(result.message ?? 'Clase finalizada exitosamente.');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {message && (
        <Card className="bg-primary/10 border-primary/30">
          <p className="font-body text-sm text-primary font-medium">
            {message}
          </p>
        </Card>
      )}
      {error && (
        <Card className="bg-error/10 border-error/30">
          <p className="font-body text-sm text-error font-medium">{error}</p>
        </Card>
      )}

      <div className="space-y-2">
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

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={classCompleted || isPending}
                onClick={() =>
                  handleToggle(enrollment.enrollmentId, 'attended')
                }
                className={`min-h-11 min-w-11 px-3 py-2 rounded-lg font-body text-xs font-medium transition-colors ${
                  records[enrollment.enrollmentId] === 'attended'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-variant text-on-surface-variant'
                } disabled:opacity-50`}
                aria-label={`Marcar ${enrollment.studentName} como asistió`}
              >
                Asistió
              </button>
              <button
                type="button"
                disabled={classCompleted || isPending}
                onClick={() => handleToggle(enrollment.enrollmentId, 'absent')}
                className={`min-h-11 min-w-11 px-3 py-2 rounded-lg font-body text-xs font-medium transition-colors ${
                  records[enrollment.enrollmentId] === 'absent'
                    ? 'bg-error text-on-error'
                    : 'bg-surface-variant text-on-surface-variant'
                } disabled:opacity-50`}
                aria-label={`Marcar ${enrollment.studentName} como ausente`}
              >
                Ausente
              </button>
            </div>
          </Card>
        ))}
      </div>

      {!classCompleted && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="w-full min-h-11 px-4 py-3 bg-primary text-on-primary font-body font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Guardando...' : 'Guardar asistencia'}
        </button>
      )}

      {!classCompleted && (
        <div className="mt-6 pt-4 border-t border-outline-variant">
          {showCompleteConfirm ? (
            <div className="rounded-lg border border-warm-wood/30 bg-warm-wood/10 p-4 space-y-3">
              <p className="font-body text-sm text-on-surface font-medium">
                ¿Estás seguro de finalizar esta clase?
              </p>
              <p className="font-body text-xs text-on-surface-variant">
                Una vez finalizada no podrás modificar la asistencia.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isCompleting}
                  onClick={handleCompleteClass}
                  className="flex-1 min-h-11 px-4 py-2 bg-secondary text-white font-body font-semibold rounded-lg hover:bg-secondary/90 disabled:opacity-50 transition-colors"
                >
                  {isCompleting ? 'Finalizando...' : 'Sí, finalizar'}
                </button>
                <button
                  type="button"
                  disabled={isCompleting}
                  onClick={() => setShowCompleteConfirm(false)}
                  className="flex-1 min-h-11 px-4 py-2 bg-surface-variant text-on-surface-variant font-body font-semibold rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={isCompleting}
              onClick={() => setShowCompleteConfirm(true)}
              className="w-full min-h-11 px-4 py-3 bg-secondary text-white font-body font-semibold rounded-lg hover:bg-secondary/90 disabled:opacity-50 transition-colors"
            >
              Finalizar clase
            </button>
          )}
        </div>
      )}

      {classCompleted && (
        <p className="font-body text-sm text-on-surface-variant text-center">
          Esta clase ya fue finalizada. La asistencia no puede modificarse.
        </p>
      )}
    </div>
  );
}
