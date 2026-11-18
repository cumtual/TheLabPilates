import { canViewGuestQr } from '../../domain/guest-qr-policy';
import type { Actor } from '../../domain/types';
import type { GuestCheckinDeps } from '../ports';

export interface GuestQrView {
  guestEnrollmentId: string;
  guestName: string;
  className: string;
  classDate: string | null;
  qrDataUrl: string;
}

export type GetGuestQrResult =
  | { ok: true; data: GuestQrView }
  | { ok: false; code: 'FORBIDDEN' | 'GUEST_QR_NOT_AVAILABLE' };

/**
 * QR de un invitado agregado por el admin (D1, D2). Es una lectura sin efectos: se puede
 * pedir cuantas veces haga falta y siempre devuelve el mismo QR mientras siga `pending`.
 */
export async function getGuestCheckinQr(
  { guestEnrollmentId, actor }: { guestEnrollmentId: unknown; actor: Actor | null },
  deps: Pick<GuestCheckinDeps, 'qrReader' | 'qr' | 'classNames'>
): Promise<GetGuestQrResult> {
  if (actor?.role !== 'admin') return { ok: false, code: 'FORBIDDEN' };
  if (typeof guestEnrollmentId !== 'string' || guestEnrollmentId.length === 0) {
    return { ok: false, code: 'GUEST_QR_NOT_AVAILABLE' };
  }

  const guest = await deps.qrReader.findById(guestEnrollmentId);
  if (!guest || !canViewGuestQr(actor, guest) || !guest.checkinToken) {
    return { ok: false, code: 'GUEST_QR_NOT_AVAILABLE' };
  }

  return {
    ok: true,
    data: {
      guestEnrollmentId: guest.guestEnrollmentId,
      guestName: guest.guestName,
      className: deps.classNames.displayName(guest.classType, guest.customName),
      classDate: guest.classDate?.toISOString() ?? null,
      qrDataUrl: await deps.qr.render(deps.qr.urlFor(guest.checkinToken)),
    },
  };
}
