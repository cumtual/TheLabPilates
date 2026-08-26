'use client';

import { useState, useTransition } from 'react';
import { updateAttendanceAction, completeClassAction } from '@/actions/coach';
import { Card } from '@/components/ui/Card';
import { GuestBadge } from '@/components/coach/GuestBadge';
import { GuestTooltip } from '@/components/coach/GuestTooltip';

interface EnrollmentRow {
  enrollmentId: string;
  status: string | null;
  studentName: string;
  studentEmail: string;
  userId: string;
}

interface GuestEnrollmentRow {
  guestEnrollmentId: string;
  guestName: string;
  origin: 'user' | 'admin';
  status: string | null;
  registeredById: string;
  registeredByName: string | null;
  registeredByEmail: string | null;
}

interface AttendanceSheetProps {
  classId: string;
  enrollments: EnrollmentRow[];
  guestEnrollments?: GuestEnrollmentRow[];
  isCompleted: boolean;
}

export function AttendanceSheet({
  classId,
  enrollments,
  guestEnrollments = [],
  isCompleted,
}: AttendanceSheetProps) {
  // Build ordered entries: each enrollment followed by their guests
  type AttendanceEntry =
    | { type: 'enrollment'; data: EnrollmentRow }
    | { type: 'guest'; data: GuestEnrollmentRow };

  const orderedEntries: AttendanceEntry[] = [];
  const guestsByRegisteredBy = new Map<string, GuestEnrollmentRow[]>();
  for (const guest of guestEnrollments) {
    const existing = guestsByRegisteredBy.get(guest.registeredById) ?? [];
    existing.push(guest);
    guestsByRegisteredBy.set(guest.registeredById, existing);
  }

  const placedGuestIds = new Set<string>();
  for (const enrollment of enrollments) {
    orderedEntries.push({ type: 'enrollment', data: enrollment });
    const guests = guestsByRegisteredBy.get(enrollment.userId) ?? [];
    for (const guest of guests) {
      orderedEntries.push({ type: 'guest', data: guest });
      placedGuestIds.add(guest.guestEnrollmentId);
    }
  }

  // Remaining guests (e.g., admin-added without a matching titular enrollment)
  for (const guest of guestEnrollments) {
    if (!placedGuestIds.has(guest.guestEnrollmentId)) {
      orderedEntries.push({ type: 'guest', data: guest });
    }
  }
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
    for (const guest of guestEnrollments) {
      if (guest.status === 'attended' || guest.status === 'absent') {
        initial[guest.guestEnrollmentId] = guest.status;
      } else {
        initial[guest.guestEnrollmentId] = 'attended';
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

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={classCompleted || isPending}
                  onClick={() =>
                    handleToggle(entry.data.enrollmentId, 'attended')
                  }
                  className={`min-h-11 min-w-11 px-3 py-2 rounded-lg font-body text-xs font-medium transition-colors ${
                    records[entry.data.enrollmentId] === 'attended'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-variant text-on-surface-variant'
                  } disabled:opacity-50`}
                  aria-label={`Marcar ${entry.data.studentName} como asistió`}
                >
                  Asistió
                </button>
                <button
                  type="button"
                  disabled={classCompleted || isPending}
                  onClick={() => handleToggle(entry.data.enrollmentId, 'absent')}
                  className={`min-h-11 min-w-11 px-3 py-2 rounded-lg font-body text-xs font-medium transition-colors ${
                    records[entry.data.enrollmentId] === 'absent'
                      ? 'bg-error text-on-error'
                      : 'bg-surface-variant text-on-surface-variant'
                  } disabled:opacity-50`}
                  aria-label={`Marcar ${entry.data.studentName} como ausente`}
                >
                  Ausente
                </button>
              </div>
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

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={classCompleted || isPending}
                  onClick={() =>
                    handleToggle(entry.data.guestEnrollmentId, 'attended')
                  }
                  className={`min-h-11 min-w-11 px-3 py-2 rounded-lg font-body text-xs font-medium transition-colors ${
                    records[entry.data.guestEnrollmentId] === 'attended'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-variant text-on-surface-variant'
                  } disabled:opacity-50`}
                  aria-label={`Marcar invitado ${entry.data.guestName} como asistió`}
                >
                  Asistió
                </button>
                <button
                  type="button"
                  disabled={classCompleted || isPending}
                  onClick={() => handleToggle(entry.data.guestEnrollmentId, 'absent')}
                  className={`min-h-11 min-w-11 px-3 py-2 rounded-lg font-body text-xs font-medium transition-colors ${
                    records[entry.data.guestEnrollmentId] === 'absent'
                      ? 'bg-error text-on-error'
                      : 'bg-surface-variant text-on-surface-variant'
                  } disabled:opacity-50`}
                  aria-label={`Marcar invitado ${entry.data.guestName} como ausente`}
                >
                  Ausente
                </button>
              </div>
            </Card>
          )
        )}
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
