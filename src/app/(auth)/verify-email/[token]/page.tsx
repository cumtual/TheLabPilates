import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Find user by verification token
  const user = await db.query.users.findFirst({
    where: eq(users.emailVerificationToken, token),
  });

  if (!user) {
    return (
      <Card className="max-w-md mx-auto">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-error text-[48px]">error</span>
          <h1 className="font-headline text-xl text-on-surface">Enlace inválido</h1>
          <p className="font-body text-sm text-on-surface-variant">
            Este enlace de verificación no es válido o ya fue utilizado.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </Card>
    );
  }

  if (user.emailVerified) {
    return (
      <Card className="max-w-md mx-auto">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-primary text-[48px]">check_circle</span>
          <h1 className="font-headline text-xl text-on-surface">Correo ya verificado</h1>
          <p className="font-body text-sm text-on-surface-variant">
            Tu correo electrónico ya fue verificado anteriormente. Puedes iniciar sesión.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            Iniciar sesión
          </Link>
        </div>
      </Card>
    );
  }

  // Verify the email
  await db
    .update(users)
    .set({ emailVerified: true, emailVerificationToken: null })
    .where(eq(users.id, user.id));

  return (
    <Card className="max-w-md mx-auto">
      <div className="text-center space-y-4">
        <span className="material-symbols-outlined text-primary text-[48px]">verified</span>
        <h1 className="font-headline text-xl text-on-surface">¡Correo verificado!</h1>
        <p className="font-body text-sm text-on-surface-variant">
          Tu correo electrónico ha sido verificado exitosamente. Ya puedes acceder a tu cuenta.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-6 py-3 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          Iniciar sesión
        </Link>
      </div>
    </Card>
  );
}
