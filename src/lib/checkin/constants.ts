/**
 * Constantes del check-in por QR (SPEC-QR-CHECKIN).
 * Este módulo no importa nada de servidor: lo usan también componentes cliente.
 */

/** Token de check-in: 64 caracteres hex en minúsculas (32 bytes aleatorios). */
export const CHECKIN_TOKEN_REGEX = /^[0-9a-f]{64}$/;

/** Intervalo del polling del modal QR del cliente. */
export const CHECKIN_STATUS_POLL_MS = 3000;

/** Tiempo máximo que el modal QR consulta el estado antes de detenerse. */
export const CHECKIN_STATUS_POLL_MAX_MS = 15 * 60 * 1000;

/** Tiempo que el modal muestra "¡Asistencia confirmada!" antes de cerrarse. */
export const CHECKIN_CONFIRMATION_DISPLAY_MS = 1500;

/**
 * Inicio del cierre automático de inasistencias (D4): 00:00 CDMX del día de
 * salida a producción. Las reservas `pending` de clases anteriores a esta fecha
 * no se tocan, para no reescribir el historial.
 * ⚠️ Ajustar al día real del deploy antes del merge (TASK-QR-DB-03).
 */
export const ATTENDANCE_AUTO_CLOSE_FROM = new Date('2026-09-24T00:00:00.000-06:00');
