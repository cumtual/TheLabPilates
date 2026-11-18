import type { Actor, GuestEnrollmentStatus, GuestOrigin } from './types';

export interface GuestQrSubject {
  origin: GuestOrigin;
  status: GuestEnrollmentStatus | null;
  checkinToken: string | null;
}

/**
 * GI-7 (D1, D2): solo el admin ve el QR, solo de invitados que agregó un admin,
 * mientras sigan `pending` y tengan token. Se puede ver cuantas veces haga falta.
 */
export function canViewGuestQr(actor: Actor | null, subject: GuestQrSubject): boolean {
  return (
    actor?.role === 'admin' &&
    subject.origin === 'admin' &&
    subject.status === 'pending' &&
    subject.checkinToken !== null
  );
}
