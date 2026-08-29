/** Timezone constant — all date rendering normalizes to Mexico City */
export const TIMEZONE = 'America/Mexico_City';

/**
 * Formatea la hora de una fecha en formato 12h con meridiano explícito "A.M."/"P.M."
 * en mayúsculas y con puntos, de forma determinística (independiente del entorno/ICU).
 * Siempre usa horario America/Mexico_City.
 * Ejemplo: "09:00 A.M.", "01:30 P.M.", "12:00 P.M." (mediodía), "12:00 A.M." (medianoche).
 */
export function formatTimeWithMeridiem(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const dayPeriodRaw = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  // Normaliza a "A.M." / "P.M." sin importar cómo lo devuelva el runtime ("AM", "a.m.", "a. m.", etc.)
  const meridiem = /p/i.test(dayPeriodRaw) ? 'P.M.' : 'A.M.';

  return `${hour}:${minute} ${meridiem}`;
}

/**
 * Formatea una fecha de forma amigable para el usuario.
 * Siempre muestra en horario America/Mexico_City.
 * Ejemplo: "Lunes 28 de julio, 2025 — 09:00 A.M."
 */
export function formatFriendlyDate(date: Date | string | null): string {
  if (!date) return 'Sin fecha';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Fecha inválida';

  const formatted = d.toLocaleDateString('es-MX', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const time = formatTimeWithMeridiem(d);

  // Capitalizar primera letra
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)} — ${time}`;
}

/**
 * Formatea una fecha larga con hora en formato 12h con meridiano explícito.
 * Ejemplo: "lunes 28 de julio de 2025, 09:00 A.M."
 * Siempre usa horario America/Mexico_City.
 *
 * @param includeYear si false, omite el año (útil para "próxima clase" cercana).
 */
export function formatFullDateTime(
  date: Date | string | null,
  includeYear: boolean = true
): string {
  if (!date) return 'Sin fecha';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Fecha inválida';

  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  };
  if (includeYear) dateOptions.year = 'numeric';

  const datePart = d.toLocaleDateString('es-MX', dateOptions);
  const time = formatTimeWithMeridiem(d);
  return `${datePart}, ${time}`;
}

/**
 * Formatea una fecha corta: "28/07/2025"
 * Siempre muestra en horario America/Mexico_City.
 */
export function formatShortDate(date: Date | string | null): string {
  if (!date) return '--/--/----';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--/--/----';

  const parts = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).formatToParts(d);

  const day = parts.find((p) => p.type === 'day')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const year = parts.find((p) => p.type === 'year')!.value;
  return `${day}/${month}/${year}`;
}

/**
 * Formatea fecha con hora corta: "28/07/2025 — 09:00 A.M."
 * Siempre muestra en horario America/Mexico_City.
 */
export function formatShortDateTime(date: Date | string | null): string {
  if (!date) return '--/--/---- — --:--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--/--/---- — --:--';

  const parts = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).formatToParts(d);

  const day = parts.find((p) => p.type === 'day')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const year = parts.find((p) => p.type === 'year')!.value;
  const time = formatTimeWithMeridiem(d);
  return `${day}/${month}/${year} — ${time}`;
}

/**
 * Formatea una fecha relativa: "Mañana", "En 3 días", "Hace 2 días"
 * Usa comparación de días de calendario en America/Mexico_City.
 */
export function formatRelativeDate(
  date: Date | string | null,
  now: Date = new Date()
): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  // Get calendar date strings in Mexico City timezone using en-CA for YYYY-MM-DD format
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const nowDateStr = dateFormatter.format(now); // e.g. "2025-07-28"
  const targetDateStr = dateFormatter.format(d); // e.g. "2025-07-29"

  // Parse into Date objects at midnight for calendar day comparison
  const nowDay = new Date(nowDateStr + 'T00:00:00');
  const targetDay = new Date(targetDateStr + 'T00:00:00');
  const diffDays = Math.round((targetDay.getTime() - nowDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays > 1 && diffDays <= 7) return `En ${diffDays} días`;
  if (diffDays < -1 && diffDays >= -7) return `Hace ${Math.abs(diffDays)} días`;

  return '';
}

/**
 * Interpreta un valor de datetime-local (sin timezone) como hora de Ciudad de México.
 * Convierte "2025-07-28T09:00" → Date object representing 2025-07-28T09:00:00 in America/Mexico_City.
 *
 * Mexico City is UTC-6 year-round (no DST since Oct 2022).
 */
export function parseDateTimeLocalAsMexicoCity(dateTimeLocal: string): Date {
  if (!dateTimeLocal) return new Date(NaN);

  // datetime-local format: "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS"
  // Append Mexico City offset (UTC-6, no DST since 2022)
  // Note: For historical dates before Oct 2022, this could be off by 1h during summer.
  // For current/future dates this is correct.
  const withOffset =
    dateTimeLocal.includes('+') || dateTimeLocal.includes('Z')
      ? dateTimeLocal
      : `${dateTimeLocal}:00-06:00`;

  return new Date(withOffset);
}
