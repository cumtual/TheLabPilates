/** Formato del token QR: 64 hex en minúsculas, idéntico al del titular. */
export const GUEST_CHECKIN_TOKEN_REGEX = /^[0-9a-f]{64}$/;

export function isWellFormedCheckinToken(value: unknown): value is string {
  return typeof value === 'string' && GUEST_CHECKIN_TOKEN_REGEX.test(value);
}
