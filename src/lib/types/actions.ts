type ActionResult =
  | { success: true; message?: string; data?: unknown }
  | { success: false; error: string; field?: string };

/** Resultado de formularios: además del primer `field`, todos los errores por ruta (Zod). */
type FormActionResult<T = undefined> =
  | { success: true; message?: string; data: T }
  | { success: false; error: string; field?: string; fieldErrors?: Record<string, string> };

/** Motivos de rechazo de una reserva (SPEC-SPECIAL-PACKAGES §4.2, §5.4). */
type BookingRejectionCode =
  | 'NO_ACTIVE_SUBSCRIPTION'
  | 'SUBSCRIPTION_EXPIRED'
  | 'NO_CREDITS'
  | 'CLASS_TYPE_NOT_INCLUDED'
  | 'GROUP_EXHAUSTED'
  | 'OUTSIDE_TIME_WINDOW'
  | 'CLASS_NOT_AVAILABLE'
  | 'CLASS_FULL'
  | 'ALREADY_ENROLLED';

type EnrollmentActionResult =
  | { success: true; message?: string; data?: { balanceId: string | null } }
  | { success: false; error: string; code?: BookingRejectionCode };

export type { ActionResult, FormActionResult, BookingRejectionCode, EnrollmentActionResult };
