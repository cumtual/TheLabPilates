/**
 * Efecto de la asistencia manual sobre un invitado (§4, GI-2, GI-3). Es una intención
 * pura; infrastructure la traduce a SQL.
 * - `attended`: conserva el primer check-in (momento y actor) o lo fija ahora.
 * - `absent`: limpia momento y actor.
 * En ambos casos el token de un solo uso queda anulado.
 */
export type GuestAttendanceTransition =
  | { status: 'attended'; checkIn: 'keep_or_now'; checkedInBy: string; clearToken: true }
  | { status: 'absent'; checkIn: 'clear'; checkedInBy: null; clearToken: true };

export function guestAttendanceTransition(
  status: 'attended' | 'absent',
  actorId: string
): GuestAttendanceTransition {
  return status === 'attended'
    ? { status, checkIn: 'keep_or_now', checkedInBy: actorId, clearToken: true }
    : { status, checkIn: 'clear', checkedInBy: null, clearToken: true };
}
