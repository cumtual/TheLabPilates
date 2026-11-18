/**
 * Códigos de error del check-in de invitados. Es un subconjunto exacto de
 * `CheckinErrorCode` (src/lib/checkin/errors.ts), así la API responde igual
 * para titulares e invitados.
 */
export type GuestCheckinErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ROLE'
  | 'NOT_CLASS_COACH'
  | 'TOKEN_NOT_FOUND'
  | 'ENROLLMENT_NOT_PENDING'
  | 'CLASS_CANCELLED'
  | 'OUTSIDE_ATTENDANCE_WINDOW';

export interface GuestCheckinErrorDetails {
  status?: string;
  classDate?: string;
}

export interface GuestCheckinFailure {
  ok: false;
  code: GuestCheckinErrorCode;
  details?: GuestCheckinErrorDetails;
}

export function guestCheckinFailure(
  code: GuestCheckinErrorCode,
  details?: GuestCheckinErrorDetails
): GuestCheckinFailure {
  return details ? { ok: false, code, details } : { ok: false, code };
}

/** Un solo mensaje para no revelar por qué no hay QR (GI-7). */
export const GUEST_QR_NOT_AVAILABLE_MESSAGE = 'Este invitado no tiene un QR disponible.';
