import { sql } from 'drizzle-orm';

/** Estados que representan una inscripción cancelada (por el cliente o por el estudio). */
export const CANCELLED_ENROLLMENT_STATUSES = ['cancelled', 'late_cancelled'] as const;
export type CancelledEnrollmentStatus = (typeof CANCELLED_ENROLLMENT_STATUSES)[number];

export function isCancelledEnrollmentStatus(
  status: string | null | undefined
): status is CancelledEnrollmentStatus {
  return (CANCELLED_ENROLLMENT_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * Patch único para TODA transición de `class_enrolleds` a cancelado.
 * `cancelled_at` lo fija el reloj de la BD (now()) para que la auditoría sea
 * consistente entre instancias; el token de check-in se invalida.
 */
export function buildEnrollmentCancellationPatch(status: CancelledEnrollmentStatus) {
  return { status, cancelledAt: sql`now()`, checkinToken: null };
}

/** Patch para transiciones de `guest_enrollments` a cancelado. */
export function buildGuestCancellationPatch(status: CancelledEnrollmentStatus) {
  return { status, cancelledAt: sql`now()` };
}
