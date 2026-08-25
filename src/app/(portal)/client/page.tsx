import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { userSubscriptions, payments, subscriptions, classEnrollments, openClasses, users } from '@/db/schema';
import { eq, desc, and, gt } from 'drizzle-orm';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';
import { ClientDashboardError } from '@/components/client/ClientDashboardError';
import { TIMEZONE } from '@/lib/utils/date';

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

type SubscriptionState =
  | { type: 'active'; daysRemaining: number; expirationDate: string; paymentConfirmed: boolean }
  | { type: 'credits_exhausted'; expirationDate: string }
  | { type: 'pending' }
  | { type: 'expired'; expirationDate: string }
  | { type: 'suspended' }
  | { type: 'none' };

async function getSubscriptionState(userId: string): Promise<SubscriptionState> {
  const result = await db
    .select({
      userSub: userSubscriptions,
      payment: payments,
      subscription: subscriptions,
    })
    .from(userSubscriptions)
    .leftJoin(payments, eq(userSubscriptions.paymentId, payments.id))
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);

  if (result.length === 0) {
    return { type: 'none' };
  }

  const { userSub, payment } = result[0];

  // Pending payment (not confirmed)
  if (payment && !payment.confirmed) {
    return { type: 'pending' };
  }

  // Suspended subscription (payment confirmed but active=false)
  if (!userSub.active && payment?.confirmed) {
    return { type: 'suspended' };
  }

  // Expired subscription
  if (userSub.expirationDate && new Date(userSub.expirationDate) < new Date()) {
    return {
      type: 'expired',
      expirationDate: formatDate(new Date(userSub.expirationDate)),
    };
  }

  // Active subscription with no credits left
  if (userSub.active && (userSub.daysRemaining ?? 0) <= 0) {
    return {
      type: 'credits_exhausted',
      expirationDate: userSub.expirationDate
        ? formatDate(new Date(userSub.expirationDate))
        : '--/--/----',
    };
  }

  // Active subscription
  if (userSub.active) {
    return {
      type: 'active',
      daysRemaining: userSub.daysRemaining ?? 0,
      expirationDate: userSub.expirationDate
        ? formatDate(new Date(userSub.expirationDate))
        : '--/--/----',
      paymentConfirmed: payment?.confirmed ?? false,
    };
  }

  // Fallback: if not active and payment is confirmed but not flagged active yet
  return { type: 'none' };
}

const classTypeLabels: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

async function getNextClass(userId: string) {
  const now = new Date();

  const result = await db
    .select({
      classDate: openClasses.classDate,
      classType: openClasses.classType,
      coachName: users.username,
    })
    .from(classEnrollments)
    .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
    .innerJoin(openClasses, eq(classEnrollments.openClassId, openClasses.id))
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(classEnrollments.status, 'pending'),
        eq(openClasses.status, 'scheduled'),
        gt(openClasses.classDate, now)
      )
    )
    .orderBy(openClasses.classDate)
    .limit(1);

  if (result.length === 0) return null;
  return result[0];
}

export default async function ClientDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  let state: SubscriptionState;
  let error = false;
  let nextClass: Awaited<ReturnType<typeof getNextClass>> = null;

  try {
    state = await getSubscriptionState(session.sub);
    nextClass = await getNextClass(session.sub);
  } catch {
    error = true;
    state = { type: 'none' };
  }

  if (error) {
    return <ClientDashboardError />;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">Mi Suscripción</h1>

      {/* Próxima clase */}
      {nextClass && (
        <Card className="border-primary/30 bg-primary/5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">event</span>
              <h2 className="font-body text-sm font-semibold text-primary uppercase tracking-wide">
                Tu próxima clase
              </h2>
            </div>
            <p className="font-body text-xl font-bold text-on-surface">
              {classTypeLabels[nextClass.classType ?? ''] ?? nextClass.classType ?? 'Clase'}
            </p>
            <p className="font-body text-base text-on-surface capitalize">
              {nextClass.classDate
                ? new Date(nextClass.classDate).toLocaleDateString('es-MX', {
                    timeZone: TIMEZONE,
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Sin fecha'}
            </p>
            {nextClass.coachName && (
              <p className="font-body text-sm text-on-surface-variant">
                Coach: {nextClass.coachName}
              </p>
            )}
          </div>
        </Card>
      )}

      {state.type === 'active' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-body text-lg font-semibold text-on-surface">
                Suscripción Activa
              </h2>
              <Badge variant="active">Activa</Badge>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <p className="font-body text-sm text-outline">Créditos de sesión</p>
                <p className="font-body text-3xl font-bold text-primary">
                  {state.daysRemaining}
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-body text-sm text-outline">Fecha de expiración</p>
                <p className="font-body text-base text-on-surface">
                  {state.expirationDate}
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-body text-sm text-outline">Estado del pago</p>
                <Badge variant={state.paymentConfirmed ? 'confirmed' : 'pending'}>
                  {state.paymentConfirmed ? 'Confirmado' : 'Pendiente'}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {state.type === 'pending' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-body text-lg font-semibold text-on-surface">
                Suscripción
              </h2>
              <Badge variant="pending">Pendiente</Badge>
            </div>

            <p className="font-body text-sm text-outline">
              Pago pendiente de confirmación
            </p>
            <p className="font-body text-sm text-on-surface-variant">
              Tu pago está siendo verificado por el administrador. Una vez confirmado,
              podrás inscribirte a clases.
            </p>

            <div className="space-y-1">
              <p className="font-body text-sm text-outline">Créditos de sesión</p>
              <p className="font-body text-base text-on-surface-variant">
                No disponible
              </p>
            </div>
          </div>
        </Card>
      )}

      {state.type === 'expired' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-body text-lg font-semibold text-on-surface">
                Suscripción
              </h2>
              <Badge variant="expired">Expirada</Badge>
            </div>

            <p className="font-body text-sm text-on-surface-variant">
              Tu suscripción expiró el {state.expirationDate}. Renueva tu suscripción
              para seguir asistiendo a clases.
            </p>

            <Link
              href="/client/subscription"
              className="inline-flex items-center justify-center w-full px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal min-h-11"
            >
              Renovar Suscripción
            </Link>
          </div>
        </Card>
      )}

      {state.type === 'credits_exhausted' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-body text-lg font-semibold text-on-surface">
                Créditos Agotados
              </h2>
              <Badge variant="pending">Sin créditos</Badge>
            </div>

            <p className="font-body text-sm text-on-surface-variant">
              Has utilizado todos tus créditos de sesión. Adquiere un nuevo paquete para seguir reservando clases.
            </p>

            <div className="space-y-1">
              <p className="font-body text-sm text-outline">Créditos disponibles</p>
              <p className="font-body text-3xl font-bold text-error">0</p>
            </div>

            <Link
              href="/client/subscription"
              className="inline-flex items-center justify-center w-full px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal min-h-11"
            >
              Adquirir Nuevo Paquete
            </Link>
          </div>
        </Card>
      )}

      {state.type === 'suspended' && (
        <Card className="border-error/30">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-body text-lg font-semibold text-on-surface">
                Suscripción Suspendida
              </h2>
              <Badge variant="cancelled">Suspendida</Badge>
            </div>

            <p className="font-body text-sm text-on-surface-variant">
              Tu suscripción ha sido suspendida por el administrador. No puedes inscribirte a clases hasta que se reactive o adquieras una nueva.
            </p>

            <Link
              href="/client/subscription"
              className="inline-flex items-center justify-center w-full px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal min-h-11"
            >
              Adquirir Nueva Suscripción
            </Link>
          </div>
        </Card>
      )}

      {state.type === 'none' && (
        <Card>
          <div className="space-y-4">
            <h2 className="font-body text-lg font-semibold text-on-surface">
              Sin Suscripción
            </h2>

            <p className="font-body text-sm text-on-surface-variant">
              Aún no tienes una suscripción activa. Adquiere un paquete para comenzar
              a reservar tus clases.
            </p>

            <Link
              href="/client/subscription"
              className="inline-flex items-center justify-center w-full px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal min-h-11"
            >
              Adquirir Suscripción
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
