'use server';

import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { payments, subscriptions, userSubscriptions } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/types';
import { buildSubscriptionSnapshot, insertBalancesFromRules } from '@/lib/subscription/credits';

const PACKAGE_UNAVAILABLE_ERROR = 'Este paquete ya no está disponible.';

export async function purchaseSubscriptionAction(
  subscriptionId: string,
  paymentType: 'transfer' | 'cash'
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'client') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  // Validate payment type
  if (paymentType !== 'transfer' && paymentType !== 'cash') {
    return { success: false, error: 'Método de pago no válido.' };
  }

  // Validate subscriptionId is provided
  if (!subscriptionId) {
    return { success: false, error: 'Debes seleccionar un paquete.' };
  }

  // Only active, non-deleted catalog packages can be bought (H9).
  const pkg = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
    with: { rules: true },
  });
  if (!pkg || !pkg.isActive || pkg.deletedAt) {
    return { success: false, error: PACKAGE_UNAVAILABLE_ERROR };
  }

  // Check for existing pending (unconfirmed) payment — block purchase if one exists (Req 5.6)
  const existingUserSubs = await db.query.userSubscriptions.findMany({
    where: eq(userSubscriptions.userId, session.sub),
  });

  for (const userSub of existingUserSubs) {
    const payment = await db.query.payments.findFirst({
      where: and(
        eq(payments.id, userSub.paymentId),
        eq(payments.confirmed, false)
      ),
    });
    if (payment) {
      return {
        success: false,
        error: 'Ya tienes un pago pendiente de confirmación. Espera a que el administrador lo confirme antes de realizar otra compra.',
      };
    }
  }

  // A new purchase converts any previously suspended subscription into 'expired'
  // and voids its remaining credits (admin suspension is superseded by the new plan).
  // Active/pending/expired subscriptions are left untouched.
  await db
    .update(userSubscriptions)
    .set({ status: 'expired', daysRemaining: 0, expirationDate: new Date() })
    .where(
      and(
        eq(userSubscriptions.userId, session.sub),
        eq(userSubscriptions.status, 'suspended')
      )
    );

  // Payment + user_subscription + copy of the package's conditions, atomically (D4).
  // The current active subscription is NOT touched here: it expires when the admin
  // confirms this payment (S3), so a rejected payment leaves it intact.
  await db.transaction(async (tx) => {
    // Create payment record with confirmed = false
    const [payment] = await tx
      .insert(payments)
      .values({
        paymentType,
        confirmed: false,
      })
      .returning();

    // Create user_subscription linked to payment with active=false and expiration_date=null
    const [userSub] = await tx
      .insert(userSubscriptions)
      .values({
        paymentId: payment.id,
        subscriptionId,
        userId: session.sub,
        active: false,
        daysRemaining: 0,
        expirationDate: null,
        ...buildSubscriptionSnapshot(pkg),
      })
      .returning({ id: userSubscriptions.id });

    if (pkg.kind === 'special') {
      if (!userSub) throw new Error('No se pudo registrar la suscripción.');
      await insertBalancesFromRules(tx, userSub.id, [...pkg.rules].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  });

  if (paymentType === 'transfer') {
    return {
      success: true,
      message: 'Pago registrado. Realiza la transferencia a la cuenta bancaria indicada y espera la confirmación del administrador.',
      data: { paymentType: 'transfer' },
    };
  }

  return {
    success: true,
    message: 'Pago registrado. Realiza el pago en efectivo en el estudio y espera la confirmación del administrador.',
    data: { paymentType: 'cash' },
  };
}
