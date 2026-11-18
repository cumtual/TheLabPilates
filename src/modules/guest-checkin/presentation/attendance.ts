import { guestAttendanceTransition } from '../domain/guest-attendance';
import { toGuestAttendanceSet } from '../infrastructure/attendance-set';

/**
 * `set` de Drizzle para la asistencia manual de un invitado (`updateAttendanceAction`):
 * registra quién lo marcó y anula el token QR (GI-2, GI-3).
 */
export function guestAttendanceSet(status: 'attended' | 'absent', actorId: string) {
  return toGuestAttendanceSet(guestAttendanceTransition(status, actorId));
}
