/**
 * Formatea una fecha de forma amigable para el usuario.
 * Ejemplo: "Lunes 28 de julio, 2025 — 09:00"
 */
export function formatFriendlyDate(date: Date | string | null): string {
  if (!date) return 'Sin fecha';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Fecha inválida';

  const formatted = d.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const time = d.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Capitalizar primera letra
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)} — ${time}`;
}

/**
 * Formatea una fecha corta: "28/07/2025"
 */
export function formatShortDate(date: Date | string | null): string {
  if (!date) return '--/--/----';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--/--/----';

  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formatea fecha con hora corta: "28/07/2025 — 09:00"
 */
export function formatShortDateTime(date: Date | string | null): string {
  if (!date) return '--/--/---- — --:--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--/--/---- — --:--';

  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} — ${hours}:${minutes}`;
}

/**
 * Timezone del negocio para comparaciones de días de calendario.
 */
export const BUSINESS_TIMEZONE = 'America/Mexico_City';

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
