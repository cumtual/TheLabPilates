/**
 * D5: inicio del cierre automático de invitados, 00:00 CDMX del día de salida a producción.
 * Los invitados `pending` de clases anteriores no se tocan, para no reescribir el historial.
 * ⚠️ Ajustar al día real del deploy antes del merge (TASK-GQR-DB-03).
 */
export const GUEST_ATTENDANCE_AUTO_CLOSE_FROM = new Date('2026-11-18T00:00:00.000-06:00');
