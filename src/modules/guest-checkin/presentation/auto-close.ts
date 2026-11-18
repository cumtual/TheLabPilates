import { closeUnattendedGuests } from '../application/use-cases/close-unattended';
import { guestCheckinDeps } from '../infrastructure/container';

/** Cron de las 00:00 CDMX: invitados `pending` de días terminados → `absent` (D5). */
export function markUnattendedGuestsAbsent(): Promise<number> {
  return closeUnattendedGuests(guestCheckinDeps());
}
