/**
 * Timezone del negocio. Todas las fechas se interpretan y muestran en este timezone.
 */
export const BUSINESS_TIMEZONE = 'America/Mexico_City';

/**
 * Formatea una fecha de forma amigable para el usuario.
 * Siempre muestra en horario America/Mexico_City.
 * Ejemplo: "Lunes 28 de julio, 2025 — 09:00"
 */
export function formatFriendlyDate(date: Date | string | null): string {
  if (!date) return 'Sin fecha';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Fecha inválida';

  const formatted = d.toLocaleDateString('es-MX', {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const time = d.toLocaleTimeString('es-MX', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Capitalizar primera letra
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)} — ${time}`;
}

/**
 * Formatea una fecha corta: "28/07/2025"
 * Siempre muestra en horario America/Mexico_City.
 */
export function formatShortDate(date: Date | string | null): string {
  if (!date) return '--/--/----';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--/--/----';

  const { year, month, day } = getCalendarDay(d, BUSINESS_TIMEZONE);
  return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
}

/**
 * Formatea fecha con hora corta: "28/07/2025 — 09:00"
 * Siempre muestra en horario America/Mexico_City.
 */
export function formatShortDateTime(date: Date | string | null): string {
  if (!date) return '--/--/---- — --:--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--/--/---- — --:--';

  const { year, month, day } = getCalendarDay(d, BUSINESS_TIMEZONE);
  const time = d.toLocaleTimeString('es-MX', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year} — ${time}`;
}

/**
 * Convierte un valor de input datetime-local (sin timezone) a Date UTC,
 * interpretándolo como hora de America/Mexico_City.
 *
 * Ejemplo: "2025-08-10T10:00" → Date que representa 10:00 CST (15:00 UTC en invierno, 16:00 UTC en verano)
 *
 * Usa Intl.DateTimeFormat para resolver correctamente el offset UTC ↔ Mexico_City
 * incluyendo horario de verano.
 */
export function parseDateTimeLocalAsMexicoCity(datetimeLocal: string): Date | null {
  if (!datetimeLocal) return null;

  // datetime-local format: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss"
  const match = datetimeLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const [, yearStr, monthStr, dayStr, hourStr, minStr, secStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const min = Number(minStr);
  const sec = Number(secStr ?? '0');

  // Mexico City is UTC-6 (standard) or UTC-5 (DST, though Mexico abolished DST in 2022
  // for most of the country — but the Intl API handles this correctly per IANA data)
  // Try offsets 5, 6, 7 to find the correct one
  for (let offsetHours = 5; offsetHours <= 7; offsetHours++) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, min, sec));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(candidate);

    const pYear = Number(parts.find(p => p.type === 'year')!.value);
    const pMonth = Number(parts.find(p => p.type === 'month')!.value);
    const pDay = Number(parts.find(p => p.type === 'day')!.value);
    const pHour = Number(parts.find(p => p.type === 'hour')!.value) % 24;
    const pMin = Number(parts.find(p => p.type === 'minute')!.value);

    if (pYear === year && pMonth === month && pDay === day && pHour === hour && pMin === min) {
      return candidate;
    }
  }

  // Fallback: assume UTC-6
  return new Date(Date.UTC(year, month - 1, day, hour + 6, min, sec));
}

/**
 * Extrae el año, mes y día de calendario de una fecha en el timezone dado.
 */
export function getCalendarDay(
  date: Date,
  timezone: string
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  return { year, month, day };
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

  const dateDay = getCalendarDay(d, BUSINESS_TIMEZONE);
  const nowDay = getCalendarDay(now, BUSINESS_TIMEZONE);

  // Normalize both to midnight UTC for their respective calendar days
  const normalizedDate = Date.UTC(dateDay.year, dateDay.month - 1, dateDay.day);
  const normalizedNow = Date.UTC(nowDay.year, nowDay.month - 1, nowDay.day);

  const diffDays = (normalizedDate - normalizedNow) / (1000 * 60 * 60 * 24);

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays > 1 && diffDays <= 7) return `En ${diffDays} días`;
  if (diffDays < -1 && diffDays >= -7) return `Hace ${Math.abs(diffDays)} días`;

  return '';
}
