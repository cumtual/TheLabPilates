import { sql } from 'drizzle-orm';
import { guestEnrollments } from '@/db/schema';
import type { GuestAttendanceTransition } from '../domain/guest-attendance';

/**
 * Traduce la intención del dominio a un `set` de Drizzle para `guest_enrollments`.
 * `attended` conserva el primer check-in (momento y actor) con `coalesce`.
 */
export function toGuestAttendanceSet(transition: GuestAttendanceTransition) {
  if (transition.status === 'attended') {
    return {
      status: 'attended' as const,
      checkedInAt: sql`coalesce(${guestEnrollments.checkedInAt}, now())`,
      checkedInById: sql`coalesce(${guestEnrollments.checkedInById}, ${transition.checkedInBy}::uuid)`,
      checkinToken: null,
    };
  }
  return { status: 'absent' as const, checkedInAt: null, checkedInById: null, checkinToken: null };
}
