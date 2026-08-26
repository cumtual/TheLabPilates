import { eq, and } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { subscriptions, userSubscriptions, payments, debitCards } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { SubscriptionCard } from '@/components/client/SubscriptionCard';
import { ActiveSubscriptionWarning } from '@/components/client/ActiveSubscriptionWarning';
import { Card } from '@/components/ui/Card';

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ continue?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { continue: shouldContinue } = await searchParams;

  // Fetch active debit card for transfer details
  const activeCard = await db.query.debitCards.findFirst({
    where: eq(debitCards.active, true),
  });
  const activeCardData = activeCard
    ? { cardName: activeCard.cardName, cardNumber: activeCard.cardNumber, cardBank: activeCard.cardBank }
    : null;

  // Fetch all available subscription packages
  const packages = await db.query.subscriptions.findMany();

  // Check if user has a pending (unconfirmed) payment
  let hasPendingPayment = false;
  let hasActiveSubscription = false;
  let activeCredits = 0;
  let activeExpiration: string | null = null;
  let isOpenLab = false;

  const existingUserSubs = await db.query.userSubscriptions.findMany({
    where: eq(userSubscriptions.userId, session.sub),
  });

  let hasSuspendedSubscription = false;

  for (const userSub of existingUserSubs) {
    // Check pending payment
    const payment = await db.query.payments.findFirst({
      where: and(
        eq(payments.id, userSub.paymentId),
        eq(payments.confirmed, false)
      ),
    });
    if (payment) {
      hasPendingPayment = true;
    }

    // Check active subscription
    if (userSub.active && userSub.expirationDate && new Date(userSub.expirationDate) > new Date()) {
      // Get the subscription plan to check if it's Open Lab
      const plan = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.id, userSub.subscriptionId),
      });

      const isOpenLabPlan = plan?.guest === true;

      // Open Lab doesn't use daysRemaining — it's always "active" if not expired
      if (isOpenLabPlan || (userSub.daysRemaining ?? 0) > 0) {
        hasActiveSubscription = true;
        isOpenLab = isOpenLabPlan;
        activeCredits = isOpenLabPlan ? 0 : (userSub.daysRemaining ?? 0);
        const exp = new Date(userSub.expirationDate);
        activeExpiration = `${exp.getDate().toString().padStart(2, '0')}/${(exp.getMonth() + 1).toString().padStart(2, '0')}/${exp.getFullYear()}`;
      }
    }

    // Check suspended subscription (confirmed payment but not active)
    if (!userSub.active) {
      const confirmedPayment = await db.query.payments.findFirst({
        where: and(
          eq(payments.id, userSub.paymentId),
          eq(payments.confirmed, true)
        ),
      });
      if (confirmedPayment) {
        hasSuspendedSubscription = true;
      }
    }
  }

  // Show warning if active subscription and user hasn't confirmed to continue
  const showActiveWarning = hasActiveSubscription && shouldContinue !== '1';
  const showSuspendedWarning = hasSuspendedSubscription && !hasActiveSubscription && shouldContinue !== '1';

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">
          Suscripciones
        </h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Elige el paquete que mejor se adapte a ti.
        </p>
      </div>

      {/* Active Subscription Warning */}
      {showActiveWarning && (
        <ActiveSubscriptionWarning
          credits={activeCredits}
          expiration={activeExpiration}
          isOpenLab={isOpenLab}
        />
      )}

      {/* Suspended Subscription Warning */}
      {showSuspendedWarning && (
        <Card className="border-error/30 bg-error/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-error text-[24px]">warning</span>
              <h2 className="font-body text-base font-semibold text-on-surface">
                Tienes una suscripción suspendida
              </h2>
            </div>
            <p className="font-body text-sm text-on-surface-variant">
              Tu suscripción anterior fue suspendida. Si adquieres un nuevo paquete, se creará una nueva suscripción independiente. La suscripción suspendida no se reactivará automáticamente.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a
                href="/client/subscription?continue=1"
                className="inline-flex items-center justify-center px-5 py-3 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
              >
                Sí, deseo continuar
              </a>
              <a
                href="/client"
                className="inline-flex items-center justify-center px-5 py-3 min-h-11 font-body text-sm font-medium text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg transition-colors hover:bg-surface-container-high"
              >
                Volver al dashboard
              </a>
            </div>
          </div>
        </Card>
      )}

      {/* Pending Payment Warning */}
      {hasPendingPayment && (
        <div className="p-4 rounded-lg bg-warm-wood/10 border border-warm-wood/30">
          <p className="font-body text-body-md text-secondary font-medium">
            Tienes un pago pendiente de confirmación. No puedes realizar otra compra hasta que el administrador confirme tu pago actual.
          </p>
        </div>
      )}

      {/* Subscription Packages - only show if not blocked by warnings */}
      {!showActiveWarning && !showSuspendedWarning && (
        <>
          {packages.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-body text-body-md text-on-surface-variant">
                No hay paquetes disponibles por el momento.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {packages.map((pkg) => (
                <SubscriptionCard
                  key={pkg.id}
                  pkg={pkg}
                  hasPendingPayment={hasPendingPayment}
                  activeCard={activeCardData}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
