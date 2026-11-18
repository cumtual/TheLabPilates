import { checkInGuestByToken } from '../application/use-cases/check-in-guest';
import type { GuestCheckinDeps } from '../application/ports';
import type { Actor } from '../domain/types';
import { guestCheckinDeps } from '../infrastructure/container';
import type { GuestCheckinResult } from './types';

/**
 * Punto de entrada del check-in de invitados para `src/lib/checkin/resolve-checkin.ts`.
 * Solo servidor: abre una transacción en la BD.
 */
export function processGuestCheckin(
  input: { token: unknown; actor: Actor | null },
  deps: GuestCheckinDeps = guestCheckinDeps()
): Promise<GuestCheckinResult> {
  return checkInGuestByToken(input, deps);
}
