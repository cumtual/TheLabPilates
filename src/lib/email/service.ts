import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'The Lab Pilates Studio <noreply@thelabpilatesstudio.com.mx>';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

interface EmailFailureLog {
  recipient: string;
  timestamp: Date;
  type: string;
  error: string;
}

// In-memory failure log (for MVP; could be persisted to DB later)
export const emailFailures: EmailFailureLog[] = [];

export async function sendEmail(
  payload: EmailPayload
): Promise<{ success: boolean; error?: string }> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });
      return { success: true };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        emailFailures.push({
          recipient: payload.to,
          timestamp: new Date(),
          type: 'send_failure',
          error: errorMessage,
        });
        return { success: false, error: errorMessage };
      }
      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password/${token}`;
  await sendEmail({
    to: email,
    subject: 'Restablecer contraseña - The Lab Pilates',
    html: `
      <h1>Restablecer contraseña</h1>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${resetUrl}">Haz clic aquí para restablecer tu contraseña</a></p>
      <p>Este enlace expira en 60 minutos.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
    `,
  });
}

export async function sendClassCancellationEmail(
  recipients: { email: string; name: string }[],
  classInfo: { type: string; date: Date; coachName: string }
): Promise<void> {
  const formattedDate = classInfo.date.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (const recipient of recipients) {
    await sendEmail({
      to: recipient.email,
      subject: 'Clase cancelada - The Lab Pilates Studio',
      html: `
        <h1>Clase Cancelada</h1>
        <p>Hola ${recipient.name},</p>
        <p>Te informamos que la clase de <strong>${classInfo.type}</strong> programada para el <strong>${formattedDate}</strong> con ${classInfo.coachName} ha sido cancelada.</p>
        <p>Tu crédito de sesión ha sido restaurado a tu suscripción.</p>
        <p>Disculpa las molestias.</p>
      `,
    });
  }
}


export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email/${token}`;
  await sendEmail({
    to: email,
    subject: 'Verifica tu correo - The Lab Pilates Studio',
    html: `
      <h1>Bienvenido a The Lab Pilates Studio</h1>
      <p>Gracias por registrarte. Para completar tu registro, verifica tu correo electrónico.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2d2926;color:#fff;text-decoration:none;border-radius:4px;">Verificar mi correo</a></p>
      <p>Si no creaste una cuenta, puedes ignorar este correo.</p>
    `,
  });
}


export async function sendPaymentRejectedEmail(
  email: string,
  name: string
): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Pago no recibido - The Lab Pilates Studio',
    html: `
      <h1>Pago no recibido</h1>
      <p>Hola ${name},</p>
      <p>Te informamos que tu pago no pudo ser verificado. Esto puede deberse a que la transferencia no fue recibida o los datos no coinciden.</p>
      <p>Tu solicitud de suscripción ha sido anulada. Puedes intentar adquirir una nueva suscripción en cualquier momento desde tu cuenta.</p>
      <p>Si consideras que esto es un error, contacta al estudio directamente.</p>
      <p>— The Lab Pilates Studio</p>
    `,
  });
}
