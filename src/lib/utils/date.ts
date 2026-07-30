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
 * Formatea una fecha relativa: "Mañana", "En 3 días", "Hace 2 días"
 */
export function formatRelativeDate(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays > 1 && diffDays <= 7) return `En ${diffDays} días`;
  if (diffDays < -1 && diffDays >= -7) return `Hace ${Math.abs(diffDays)} días`;

  return '';
}
