'use server';

import { getSession } from '@/lib/auth/session';
import type { FormActionResult } from '@/lib/types/actions';
import { getGuestCheckinQr } from '../../application/use-cases/get-guest-qr';
import { GUEST_QR_NOT_AVAILABLE_MESSAGE } from '../../domain/errors';
import type { ActorRole } from '../../domain/types';
import { guestCheckinDeps } from '../../infrastructure/container';
import type { GuestQrView } from '../types';

const FORBIDDEN_ERROR = 'No tienes permisos para esta acción.';
const GENERIC_ERROR = 'No pudimos generar el código QR. Intenta de nuevo.';

/**
 * QR de check-in de un invitado agregado por el admin (SPEC-GUEST-QR-CHECKIN §6.2).
 * Solo lectura: no cambia nada, por eso no pide confirmación.
 */
export async function getGuestCheckinQrAction(guestEnrollmentId: string): Promise<FormActionResult<GuestQrView>> {
  const session = await getSession();
  const actor = session ? { id: session.sub, role: session.role as ActorRole } : null;
  if (actor?.role !== 'admin') return { success: false, error: FORBIDDEN_ERROR };

  try {
    const result = await getGuestCheckinQr({ guestEnrollmentId, actor }, guestCheckinDeps());
    if (!result.ok) {
      return { success: false, error: result.code === 'FORBIDDEN' ? FORBIDDEN_ERROR : GUEST_QR_NOT_AVAILABLE_MESSAGE };
    }
    return { success: true, data: result.data };
  } catch (error) {
    console.error('[guest-checkin] QR', error);
    return { success: false, error: GENERIC_ERROR };
  }
}
