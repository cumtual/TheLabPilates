import type { UserRole } from '@/lib/types/roles';
import { getClassDisplayName } from '@/lib/utils/class-type';
import { isAttendanceWindowOpen } from '@/lib/utils/date';
import { runCheckinTransaction, type CheckinRepository } from './checkin-repository';
import type { CheckinErrorCode, CheckinErrorDetails } from './errors';
import { isValidCheckinToken } from './token';

export interface CheckinActor {
  id: string;
  role: UserRole;
}

export interface CheckinSuccess {
  enrollmentId: string;
  studentName: string;
  className: string;
  classDate: string | null;
  checkedInAt: string;
}

export type CheckinFailure = {
  ok: false;
  code: CheckinErrorCode;
  details?: CheckinErrorDetails;
};

export type CheckinResult = { ok: true; data: CheckinSuccess } | CheckinFailure;

export type CheckinTransactionRunner = <T>(
  work: (repository: CheckinRepository) => Promise<T>
) => Promise<T>;

function fail(code: CheckinErrorCode, details?: CheckinErrorDetails): CheckinFailure {
  return details ? { ok: false, code, details } : { ok: false, code };
}

/**
 * Registra la asistencia de una reserva a partir de su token QR
 * (SPEC-QR-CHECKIN §7.2.1). La búsqueda con bloqueo y el UPDATE con guardas
 * corren en una sola transacción: un token solo puede usarse una vez.
 */
export async function processCheckin(
  { token, actor, now = new Date() }: { token: unknown; actor: CheckinActor | null; now?: Date },
  runInTransaction: CheckinTransactionRunner = runCheckinTransaction
): Promise<CheckinResult> {
  if (!actor) return fail('UNAUTHENTICATED');
  if (actor.role !== 'coach' && actor.role !== 'admin') return fail('FORBIDDEN_ROLE');
  if (!isValidCheckinToken(token)) return fail('TOKEN_NOT_FOUND');
  const checkinToken: string = token;

  return runInTransaction(async (repository) => {
    const enrollment = await repository.findByTokenForUpdate(checkinToken);
    if (!enrollment) return fail('TOKEN_NOT_FOUND');

    // Autorización antes de revelar el estado: el coach solo registra sus clases.
    if (actor.role === 'coach' && enrollment.coachUserId !== actor.id) {
      return fail('NOT_CLASS_COACH');
    }
    if (enrollment.status !== 'pending') {
      return fail('ENROLLMENT_NOT_PENDING', { status: enrollment.status ?? 'unknown' });
    }
    if (enrollment.classStatus === 'cancelled') return fail('CLASS_CANCELLED');
    if (!isAttendanceWindowOpen(enrollment.classDate, now)) {
      return fail(
        'OUTSIDE_ATTENDANCE_WINDOW',
        enrollment.classDate ? { classDate: enrollment.classDate.toISOString() } : undefined
      );
    }

    const checkedInAt = await repository.markAttended(enrollment.enrollmentId, checkinToken);
    // 0 filas: otra transacción usó el token primero.
    if (!checkedInAt) return fail('TOKEN_NOT_FOUND');

    return {
      ok: true,
      data: {
        enrollmentId: enrollment.enrollmentId,
        studentName: enrollment.studentName,
        className: getClassDisplayName(enrollment.classType, enrollment.customName),
        classDate: enrollment.classDate?.toISOString() ?? null,
        checkedInAt: checkedInAt.toISOString(),
      },
    };
  });
}
