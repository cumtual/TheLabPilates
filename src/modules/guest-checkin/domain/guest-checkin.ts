import type { Actor, ClassStatus, GuestEnrollmentStatus } from './types';
import { guestCheckinFailure, type GuestCheckinFailure } from './errors';

/** Invitado encontrado por su token, con los datos de su clase. */
export interface GuestCheckinCandidate {
  guestEnrollmentId: string;
  status: GuestEnrollmentStatus | null;
  guestName: string;
  invitedByName: string | null;
  classDate: Date | null;
  classStatus: ClassStatus | null;
  coachUserId: string | null;
  classType: string | null;
  customName: string | null;
}

/**
 * Reglas del check-in de un invitado (GI-1, GI-5, GI-6). Mismo orden que el titular:
 * la autorización se evalúa antes de revelar el estado de la reserva.
 */
export function evaluateGuestCheckin({
  candidate,
  actor,
  isWithinAttendanceWindow,
}: {
  candidate: GuestCheckinCandidate;
  actor: Actor;
  isWithinAttendanceWindow: boolean;
}): { ok: true } | GuestCheckinFailure {
  if (actor.role !== 'admin' && !(actor.role === 'coach' && candidate.coachUserId === actor.id)) {
    return guestCheckinFailure(actor.role === 'coach' ? 'NOT_CLASS_COACH' : 'FORBIDDEN_ROLE');
  }
  if (candidate.status !== 'pending') {
    return guestCheckinFailure('ENROLLMENT_NOT_PENDING', { status: candidate.status ?? 'unknown' });
  }
  if (candidate.classStatus === 'cancelled') return guestCheckinFailure('CLASS_CANCELLED');
  if (!isWithinAttendanceWindow) {
    return guestCheckinFailure(
      'OUTSIDE_ATTENDANCE_WINDOW',
      candidate.classDate ? { classDate: candidate.classDate.toISOString() } : undefined
    );
  }
  return { ok: true };
}
