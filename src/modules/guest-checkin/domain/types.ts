/** Tipos del dominio de check-in de invitados (SPEC-GUEST-QR-CHECKIN). Sin dependencias. */

export type ActorRole = 'client' | 'coach' | 'admin' | 'barra';

/** Quién ejecuta la operación: siempre sale de la sesión, nunca del cliente. */
export interface Actor {
  id: string;
  role: ActorRole;
}

export type GuestEnrollmentStatus = 'pending' | 'attended' | 'absent' | 'late_cancelled' | 'cancelled';
export type ClassStatus = 'scheduled' | 'cancelled' | 'completed';
export type GuestOrigin = 'user' | 'admin';

/** Solo coach y admin registran asistencia (GI-5). */
export function isStaff(actor: Actor): boolean {
  return actor.role === 'coach' || actor.role === 'admin';
}
