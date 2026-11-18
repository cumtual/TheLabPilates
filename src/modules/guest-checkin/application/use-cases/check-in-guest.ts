import { evaluateGuestCheckin } from '../../domain/guest-checkin';
import { guestCheckinFailure, type GuestCheckinFailure } from '../../domain/errors';
import { isWellFormedCheckinToken } from '../../domain/token';
import { isStaff, type Actor } from '../../domain/types';
import type { GuestCheckinDeps } from '../ports';

export interface GuestCheckinSuccess {
  guestEnrollmentId: string;
  guestName: string;
  invitedByName: string | null;
  className: string;
  classDate: string | null;
  checkedInAt: string;
}

export type GuestCheckinResult = { ok: true; data: GuestCheckinSuccess } | GuestCheckinFailure;

/**
 * Registra la asistencia de un invitado a partir de su token QR (SPEC-GUEST-QR-CHECKIN §5.2).
 * La búsqueda con bloqueo y el UPDATE con guardas corren en una sola transacción:
 * un token solo puede usarse una vez.
 */
export async function checkInGuestByToken(
  { token, actor }: { token: unknown; actor: Actor | null },
  deps: Pick<GuestCheckinDeps, 'uow' | 'calendar' | 'classNames' | 'clock'>
): Promise<GuestCheckinResult> {
  if (!actor) return guestCheckinFailure('UNAUTHENTICATED');
  if (!isStaff(actor)) return guestCheckinFailure('FORBIDDEN_ROLE');
  if (!isWellFormedCheckinToken(token)) return guestCheckinFailure('TOKEN_NOT_FOUND');
  const checkinToken: string = token;
  const now = deps.clock.now();

  return deps.uow.run(async (repository) => {
    const candidate = await repository.findByTokenForUpdate(checkinToken);
    if (!candidate) return guestCheckinFailure('TOKEN_NOT_FOUND');

    const verdict = evaluateGuestCheckin({
      candidate,
      actor,
      isWithinAttendanceWindow: deps.calendar.isWindowOpen(candidate.classDate, now),
    });
    if (!verdict.ok) return verdict;

    const checkedInAt = await repository.markAttended({
      guestEnrollmentId: candidate.guestEnrollmentId,
      token: checkinToken,
      actorId: actor.id,
    });
    // 0 filas: otra transacción usó el token primero.
    if (!checkedInAt) return guestCheckinFailure('TOKEN_NOT_FOUND');

    return {
      ok: true,
      data: {
        guestEnrollmentId: candidate.guestEnrollmentId,
        guestName: candidate.guestName,
        invitedByName: candidate.invitedByName,
        className: deps.classNames.displayName(candidate.classType, candidate.customName),
        classDate: candidate.classDate?.toISOString() ?? null,
        checkedInAt: checkedInAt.toISOString(),
      },
    };
  });
}
