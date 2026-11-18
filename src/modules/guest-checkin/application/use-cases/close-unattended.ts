import type { GuestCheckinDeps } from '../ports';

/**
 * Cierre automático de invitados (D5). Corre en el cron de las 00:00 CDMX: los invitados
 * que siguen `pending` de clases de días anteriores pasan a `absent`. Es idempotente y se
 * recupera de días perdidos porque compara contra el inicio del día actual.
 */
export function closeUnattendedGuests(
  deps: Pick<GuestCheckinDeps, 'autoClose' | 'calendar' | 'clock' | 'autoCloseFrom'>
): Promise<number> {
  return deps.autoClose.markUnattendedAbsent({
    from: deps.autoCloseFrom,
    cutoff: deps.calendar.dayStart(deps.clock.now()),
  });
}
