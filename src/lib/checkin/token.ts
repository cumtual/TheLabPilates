import { randomBytes } from 'node:crypto';
import { CHECKIN_TOKEN_REGEX } from './constants';

/** Token de un solo uso: 32 bytes aleatorios en hex (256 bits). */
export function generateCheckinToken(): string {
  return randomBytes(32).toString('hex');
}

export function isValidCheckinToken(value: unknown): value is string {
  return typeof value === 'string' && CHECKIN_TOKEN_REGEX.test(value);
}

/**
 * URL absoluta que codifica el QR: `${APP_URL}/check-in?token=...`.
 * Lanza un error si no hay URL base: un QR con una URL relativa no se puede escanear.
 */
export function buildCheckinUrl(
  token: string,
  baseUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL
): string {
  const origin = baseUrl?.trim().replace(/\/+$/, '');
  if (!origin) {
    throw new Error('NEXT_PUBLIC_APP_URL no está configurada.');
  }
  return `${origin}/check-in?token=${encodeURIComponent(token)}`;
}
