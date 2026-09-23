const MAX_REDIRECT_LENGTH = 512;
const INTERNAL_BASE = 'http://internal.invalid';

/**
 * Valida un destino post-login. Solo acepta rutas internas de la app
 * (`/coach`, `/check-in?token=…`); cualquier otra cosa devuelve `null`,
 * para evitar open redirects.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_REDIRECT_LENGTH) {
    return null;
  }
  // Protocol-relative (//host) o con backslash (/\host) apuntan a otro origen.
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  // Caracteres de control o backslashes: posibles inyecciones de cabecera o de host.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;

  try {
    return new URL(value, INTERNAL_BASE).origin === INTERNAL_BASE ? value : null;
  } catch {
    return null;
  }
}
