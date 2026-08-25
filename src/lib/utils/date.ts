/** Timezone constant — all date rendering normalizes to Mexico City */
export const TIMEZONE = 'America/Mexico_City';

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
    timeZone: TIMEZONE,
  });

  const time = d.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
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
 * Formatea fecha con hora corta: "28/07/2025 — 09:00"
 */
export function formatShortDateTime(date: Date | string | null): string {
  if (!date) return '--/--/---- — --:--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--/--/---- — --:--';

  const parts = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  }).formatToParts(d);

  const day = parts.find((p) => p.type === 'day')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const year = parts.find((p) => p.type === 'year')!.value;
  const hours = parts.find((p) => p.type === 'hour')!.value;
  const minutes = parts.find((p) => p.type === 'minute')!.value;
  return `${day}/${month}/${year} — ${hours}:${minutes}`;
}

/**
 * Formatea una fecha relativa: "Mañana", "En 3 días", "Hace 2 días"
 */
export function formatRelativeDate(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();

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
