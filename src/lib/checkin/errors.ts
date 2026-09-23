import { formatFullDateTime } from '@/lib/utils/date';

/**
 * Códigos de error del check-in por QR (SPEC-QR-CHECKIN §7).
 * Seguro para el cliente: no importa nada de servidor.
 */
export type CheckinErrorCode =
  | 'INVALID_PAYLOAD'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ROLE'
  | 'NOT_CLASS_COACH'
  | 'INVALID_ORIGIN'
  | 'TOKEN_NOT_FOUND'
  | 'ENROLLMENT_NOT_FOUND'
  | 'ENROLLMENT_NOT_PENDING'
  | 'CLASS_CANCELLED'
  | 'OUTSIDE_ATTENDANCE_WINDOW'
  | 'INTERNAL_ERROR';

export interface CheckinErrorDetails {
  status?: string;
  classDate?: string;
}

export const CHECKIN_HTTP_STATUS: Record<CheckinErrorCode, number> = {
  INVALID_PAYLOAD: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  NOT_CLASS_COACH: 403,
  INVALID_ORIGIN: 403,
  TOKEN_NOT_FOUND: 404,
  ENROLLMENT_NOT_FOUND: 404,
  ENROLLMENT_NOT_PENDING: 409,
  CLASS_CANCELLED: 409,
  OUTSIDE_ATTENDANCE_WINDOW: 409,
  INTERNAL_ERROR: 500,
};

export const INVALID_QR_MESSAGE = 'Código QR inválido o ya utilizado';

export const CHECKIN_ERROR_MESSAGES: Record<CheckinErrorCode, string> = {
  INVALID_PAYLOAD: INVALID_QR_MESSAGE,
  UNAUTHENTICATED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  FORBIDDEN_ROLE: 'Solo coaches y administradores pueden registrar asistencia.',
  NOT_CLASS_COACH: 'Esta reserva es de una clase de otro coach.',
  INVALID_ORIGIN: 'Solicitud no permitida.',
  TOKEN_NOT_FOUND: INVALID_QR_MESSAGE,
  ENROLLMENT_NOT_FOUND: 'Reserva no encontrada.',
  ENROLLMENT_NOT_PENDING: 'Esta reserva ya no está pendiente.',
  CLASS_CANCELLED: 'La clase de esta reserva fue cancelada.',
  OUTSIDE_ATTENDANCE_WINDOW: 'Este código no corresponde a una clase de hoy.',
  INTERNAL_ERROR: 'No pudimos registrar la asistencia. Intenta de nuevo.',
};

export function isCheckinErrorCode(value: unknown): value is CheckinErrorCode {
  return typeof value === 'string' && value in CHECKIN_HTTP_STATUS;
}

/** Mensaje para la UI; agrega la fecha de la clase cuando está disponible. */
export function getCheckinErrorMessage(
  code: CheckinErrorCode,
  details?: CheckinErrorDetails
): string {
  if (code === 'OUTSIDE_ATTENDANCE_WINDOW' && details?.classDate) {
    return `Este código es para la clase del ${formatFullDateTime(details.classDate)}.`;
  }
  return CHECKIN_ERROR_MESSAGES[code];
}
