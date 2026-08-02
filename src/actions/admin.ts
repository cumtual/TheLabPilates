'use server';

import { eq, and, gt, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  payments,
  subscriptions,
  openClasses,
  classEnrollments,
  userSubscriptions,
  users,
} from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { sendClassCancellationEmail, sendPaymentRejectedEmail } from '@/lib/email/service';
import type { ActionResult } from '@/lib/types';
import { ALL_ROLES } from '@/lib/types/roles';
import type { UserRole } from '@/lib/types/roles';

export async function cancelClassAction(classId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!classId) {
    return { success: false, error: 'ID de clase no proporcionado.' };
  }

  // Get the class
  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, classId),
  });

  if (!openClass) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  // Block re-cancellation of already cancelled classes (Req 10.2)
  if (openClass.status === 'cancelled') {
    return { success: false, error: 'Esta clase ya está cancelada.' };
  }

  // Get all pending enrollments with user subscription info
  const pendingEnrollments = await db
    .select({
      enrollmentId: classEnrollments.id,
      userSubscriptionId: classEnrollments.userSubscriptionId,
    })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.openClassId, classId),
        eq(classEnrollments.status, 'pending')
      )
    );

  // Atomic: cancel class + refund all pending enrollees + update enrollment statuses
  await db.transaction(async (tx) => {
    // Set class status to 'cancelled' (Req 10.1)
    await tx
      .update(openClasses)
      .set({ status: 'cancelled' })
      .where(eq(openClasses.id, classId));

    // For each pending enrollment: increment days_remaining + update status (Req 10.3)
    for (const enrollment of pendingEnrollments) {
      await tx.execute(sql`
        UPDATE user_suscriptions
        SET days_remaining = days_remaining + 1
        WHERE id = ${enrollment.userSubscriptionId}
      `);

      await tx
        .update(classEnrollments)
        .set({ status: 'cancelled' })
        .where(eq(classEnrollments.id, enrollment.enrollmentId));
    }
  });

  // Send notification emails (non-blocking, after transaction) (Req 10.4)
  if (pendingEnrollments.length > 0) {
    // Get recipient info for emails
    const recipients: { email: string; name: string }[] = [];

    for (const enrollment of pendingEnrollments) {
      const userSub = await db.query.userSubscriptions.findFirst({
        where: eq(userSubscriptions.id, enrollment.userSubscriptionId),
      });

      if (userSub) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, userSub.userId),
        });

        if (user) {
          recipients.push({ email: user.email, name: user.username });
        }
      }
    }

    // Get coach name
    let coachName = 'Instructor';
    if (openClass.coachUserId) {
      const coach = await db.query.users.findFirst({
        where: eq(users.id, openClass.coachUserId),
      });
      if (coach) {
        coachName = coach.username;
      }
    }

    // Send emails non-blocking (don't await — fire and forget)
    const classTypeLabels: Record<string, string> = {
      yoga: 'Yoga',
      mat_pilates: 'Mat Pilates',
      barre: 'Barre',
    };

    if (recipients.length > 0) {
      sendClassCancellationEmail(recipients, {
        type: classTypeLabels[openClass.classType ?? ''] ?? openClass.classType ?? 'Clase',
        date: openClass.classDate ?? new Date(),
        coachName,
      }).catch(() => {
        // Email failures are logged internally by the email service
      });
    }
  }

  revalidatePath('/admin/classes');
  return { success: true, message: 'Clase cancelada. Créditos restaurados a los alumnos.' };
}


export async function confirmPaymentAction(
  paymentId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!paymentId) {
    return { success: false, error: 'ID de pago no proporcionado.' };
  }

  // Get payment record
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });

  if (!payment) {
    return { success: false, error: 'Pago no encontrado.' };
  }

  // Block re-confirmation (Req 9.2)
  if (payment.confirmed) {
    return { success: false, error: 'Este pago ya fue confirmado.' };
  }

  // Get linked user_subscription to find the subscription's sessions count
  const userSub = await db.query.userSubscriptions.findFirst({
    where: eq(userSubscriptions.paymentId, paymentId),
  });

  if (!userSub) {
    return { success: false, error: 'Suscripción vinculada no encontrada.' };
  }

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, userSub.subscriptionId),
  });

  const sessionsToAdd = sub?.sessions ?? 0;

  // Atomic transaction (Req 9.3): if any step fails, all changes rollback
  await db.transaction(async (tx) => {
    // 9.4: Set confirmed=true + date_confirmed
    await tx
      .update(payments)
      .set({ confirmed: true, dateConfirmed: new Date() })
      .where(eq(payments.id, paymentId));

    // 9.5: Set active=true on user_subscription
    await tx
      .update(userSubscriptions)
      .set({ active: true })
      .where(eq(userSubscriptions.paymentId, paymentId));

    // 9.6: Accumulate days_remaining += sessions (not reset)
    // 9.7: Set expiration_date = NOW() + 30 days
    await tx.execute(sql`
      UPDATE user_suscriptions
      SET days_remaining = days_remaining + ${sessionsToAdd},
          expiration_date = NOW() + INTERVAL '30 days'
      WHERE payment_id = ${paymentId}
    `);
  });

  revalidatePath('/admin/payments');
  return { success: true, message: 'Pago confirmado exitosamente.' };
}


export async function changeUserRoleAction(
  userId: string,
  newRole: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!userId) {
    return { success: false, error: 'ID de usuario no proporcionado.' };
  }

  // Validate role is one of: client, coach, admin (Req 11.2)
  if (!ALL_ROLES.includes(newRole as UserRole)) {
    return { success: false, error: 'Rol no válido.' };
  }

  // Verify user exists
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return { success: false, error: 'Usuario no encontrado.' };
  }

  // Update the user's role (Req 11.1)
  await db
    .update(users)
    .set({ role: newRole as UserRole })
    .where(eq(users.id, userId));

  revalidatePath('/admin/users');
  return { success: true, message: 'Rol actualizado exitosamente.' };
}


export async function suspendSubscriptionAction(
  subscriptionId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!subscriptionId) {
    return { success: false, error: 'ID de suscripción no proporcionado.' };
  }

  // Get the subscription
  const userSub = await db.query.userSubscriptions.findFirst({
    where: eq(userSubscriptions.id, subscriptionId),
  });

  if (!userSub) {
    return { success: false, error: 'Suscripción no encontrada.' };
  }

  if (!userSub.active) {
    return { success: false, error: 'La suscripción ya está suspendida.' };
  }

  // Get future pending enrollments linked to this subscription
  const futureEnrollments = await db
    .select({
      enrollmentId: classEnrollments.id,
    })
    .from(classEnrollments)
    .innerJoin(openClasses, eq(classEnrollments.openClassId, openClasses.id))
    .where(
      and(
        eq(classEnrollments.userSubscriptionId, subscriptionId),
        eq(classEnrollments.status, 'pending'),
        gt(openClasses.classDate, sql`NOW()`)
      )
    );

  // Atomic transaction: suspend + cancel enrollments + refund credits (Req 11.3)
  await db.transaction(async (tx) => {
    // Set active=false
    await tx
      .update(userSubscriptions)
      .set({ active: false })
      .where(eq(userSubscriptions.id, subscriptionId));

    // Cancel future enrollments + refund each credit
    for (const enrollment of futureEnrollments) {
      await tx
        .update(classEnrollments)
        .set({ status: 'cancelled' })
        .where(eq(classEnrollments.id, enrollment.enrollmentId));

      await tx.execute(sql`
        UPDATE user_suscriptions
        SET days_remaining = days_remaining + 1
        WHERE id = ${subscriptionId}
      `);
    }
  });

  revalidatePath('/admin/subscriptions');
  return { success: true, message: 'Suscripción suspendida. Créditos restaurados.' };
}

export async function refundSessionCreditAction(
  userId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!userId) {
    return { success: false, error: 'ID de usuario no proporcionado.' };
  }

  // Find active subscription for this user (Req 11.4)
  const activeSub = await db.query.userSubscriptions.findFirst({
    where: and(
      eq(userSubscriptions.userId, userId),
      eq(userSubscriptions.active, true)
    ),
  });

  // Req 11.5: Block if no active subscription
  if (!activeSub) {
    return {
      success: false,
      error: 'El usuario no tiene una suscripción activa.',
    };
  }

  // Increment days_remaining by 1
  await db.execute(sql`
    UPDATE user_suscriptions
    SET days_remaining = days_remaining + 1
    WHERE id = ${activeSub.id}
  `);

  revalidatePath('/admin/subscriptions');
  return { success: true, message: 'Crédito de sesión otorgado.' };
}


export async function reactivateSubscriptionAction(
  subscriptionId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!subscriptionId) {
    return { success: false, error: 'ID de suscripción no proporcionado.' };
  }

  const userSub = await db.query.userSubscriptions.findFirst({
    where: eq(userSubscriptions.id, subscriptionId),
  });

  if (!userSub) {
    return { success: false, error: 'Suscripción no encontrada.' };
  }

  if (userSub.active) {
    return { success: false, error: 'La suscripción ya está activa.' };
  }

  // Check if user already has another active subscription
  const existingActive = await db.query.userSubscriptions.findFirst({
    where: and(
      eq(userSubscriptions.userId, userSub.userId),
      eq(userSubscriptions.active, true)
    ),
  });

  if (existingActive) {
    return {
      success: false,
      error: 'El usuario ya tiene una suscripción activa. No se puede reactivar otra.',
    };
  }

  // Reactivate: set active=true and extend expiration by 30 days from now
  await db
    .update(userSubscriptions)
    .set({
      active: true,
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .where(eq(userSubscriptions.id, subscriptionId));

  revalidatePath('/admin/subscriptions');
  return { success: true, message: 'Suscripción reactivada exitosamente.' };
}


export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!userId) {
    return { success: false, error: 'ID de usuario no proporcionado.' };
  }

  // Prevent self-deletion
  if (userId === session.sub) {
    return { success: false, error: 'No puedes eliminar tu propia cuenta.' };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return { success: false, error: 'Usuario no encontrado.' };
  }

  if (user.deletedAt) {
    return { success: false, error: 'Este usuario ya fue eliminado.' };
  }

  // Soft delete: set deleted_at timestamp
  await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, userId));

  revalidatePath('/admin/users');
  return { success: true, message: 'Cuenta eliminada exitosamente.' };
}

export async function adminCreateClassAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const classDate = formData.get('classDate') as string;
  const capacityStr = formData.get('capacity') as string;
  const classType = formData.get('classType') as string;
  const coachId = formData.get('coachId') as string;

  // Validate date is in the future
  const date = new Date(classDate);
  if (!classDate || isNaN(date.getTime()) || date <= new Date()) {
    return { success: false, error: 'La fecha debe ser en el futuro.', field: 'classDate' };
  }

  // Validate capacity 1-20
  const capacity = parseInt(capacityStr, 10);
  if (isNaN(capacity) || capacity < 1 || capacity > 20) {
    return { success: false, error: 'La capacidad debe ser entre 1 y 20.', field: 'capacity' };
  }

  // Validate class type
  if (!classType || !['yoga', 'mat_pilates', 'barre'].includes(classType)) {
    return { success: false, error: 'Tipo de clase no válido.', field: 'classType' };
  }

  // Validate coach exists and has coach/admin role
  if (!coachId) {
    return { success: false, error: 'Debes seleccionar un coach.', field: 'coachId' };
  }

  const coach = await db.query.users.findFirst({
    where: eq(users.id, coachId),
  });

  if (!coach || coach.deletedAt || (coach.role !== 'coach' && coach.role !== 'admin')) {
    return { success: false, error: 'Coach no válido.', field: 'coachId' };
  }

  await db.insert(openClasses).values({
    classDate: date,
    coachUserId: coachId,
    capacity,
    classType: classType as 'yoga' | 'mat_pilates' | 'barre',
    status: 'scheduled',
    available: 'available',
  });

  revalidatePath('/admin/classes');
  return { success: true, message: '¡Clase creada exitosamente!' };
}


export async function rejectPaymentAction(paymentId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!paymentId) {
    return { success: false, error: 'ID de pago no proporcionado.' };
  }

  // Get payment
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });

  if (!payment) {
    return { success: false, error: 'Pago no encontrado.' };
  }

  if (payment.confirmed) {
    return { success: false, error: 'No se puede rechazar un pago ya confirmado.' };
  }

  // Get linked user subscription to find the user
  const userSub = await db.query.userSubscriptions.findFirst({
    where: eq(userSubscriptions.paymentId, paymentId),
  });

  // Delete the user subscription and payment (clean slate for the client)
  if (userSub) {
    // Delete enrollment records linked to this subscription (if any)
    await db.delete(classEnrollments).where(eq(classEnrollments.userSubscriptionId, userSub.id));
    // Delete the user subscription
    await db.delete(userSubscriptions).where(eq(userSubscriptions.id, userSub.id));
  }

  // Delete the payment
  await db.delete(payments).where(eq(payments.id, paymentId));

  // Send notification email to the client
  if (userSub) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userSub.userId),
    });
    if (user) {
      sendPaymentRejectedEmail(user.email, user.username).catch(() => {
        // Email failures are logged internally
      });
    }
  }

  revalidatePath('/admin/payments');
  return { success: true, message: 'Pago rechazado y eliminado. El cliente ha sido notificado.' };
}
