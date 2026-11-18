import { processGuestCheckin } from '@/modules/guest-checkin/presentation/checkin';
import type { GuestCheckinResult } from '@/modules/guest-checkin/presentation/types';
import type { CheckinErrorCode, CheckinErrorDetails } from './errors';
import { processCheckin, type CheckinActor, type CheckinResult, type CheckinSuccess } from './process-checkin';

/**
 * Adaptador del check-in por QR (SPEC-GUEST-QR-CHECKIN §5.4). El QR del titular y el
 * del invitado comparten URL y formato: primero se intenta con la reserva del titular
 * (flujo sin cambios) y, solo si el token no existe ahí, con los invitados.
 */

export type AnyCheckinSuccess =
  | (CheckinSuccess & { subject: 'enrollment' })
  | (CheckinSuccess & { subject: 'guest'; invitedByName: string | null });

export type AnyCheckinResult =
  | { ok: true; data: AnyCheckinSuccess }
  | { ok: false; code: CheckinErrorCode; details?: CheckinErrorDetails };

interface CheckinProcessors {
  titular: (input: { token: unknown; actor: CheckinActor | null }) => Promise<CheckinResult>;
  guest: (input: { token: unknown; actor: CheckinActor | null }) => Promise<GuestCheckinResult>;
}

const defaultProcessors: CheckinProcessors = {
  titular: (input) => processCheckin(input),
  guest: (input) => processGuestCheckin(input),
};

export async function processAnyCheckin(
  input: { token: unknown; actor: CheckinActor | null },
  processors: CheckinProcessors = defaultProcessors
): Promise<AnyCheckinResult> {
  const titular = await processors.titular(input);
  if (titular.ok) return { ok: true, data: { subject: 'enrollment', ...titular.data } };
  // Cualquier otro error (401/403/409) pertenece a la reserva del titular: se responde tal cual.
  if (titular.code !== 'TOKEN_NOT_FOUND') return titular;

  const guest = await processors.guest(input);
  if (!guest.ok) return guest;

  const { guestEnrollmentId, guestName, ...rest } = guest.data;
  return {
    ok: true,
    data: { subject: 'guest', enrollmentId: guestEnrollmentId, studentName: guestName, ...rest },
  };
}
