import { generateGuestCheckinToken } from '../infrastructure/adapters';

/** Token QR para un invitado nuevo agregado por el admin (D1). */
export function newGuestCheckinToken(): string {
  return generateGuestCheckinToken();
}
