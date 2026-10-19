import { sendEmail } from '@/lib/email/service';
import type { ClosingEmailData, ClosingNotifier } from '../application/ports';
import { closingCreatedEmail, closingResolvedEmail } from './closing-email-templates';

/** Envía el correo a cada destinatario de `cafeteria_settings`; `true` solo si llegó a todos. */
async function sendToAll(recipients: readonly string[], message: { subject: string; html: string }): Promise<boolean> {
  if (recipients.length === 0) return false;
  let allSent = true;
  for (const to of recipients) {
    try {
      const result = await sendEmail({ to, ...message });
      allSent &&= result.success;
    } catch {
      allSent = false;
    }
  }
  return allSent;
}

export const resendClosingNotifier: ClosingNotifier = {
  closingCreated: (data: ClosingEmailData) => sendToAll(data.recipients, closingCreatedEmail(data)),
  closingResolved: (data: ClosingEmailData) => sendToAll(data.recipients, closingResolvedEmail(data)),
};
