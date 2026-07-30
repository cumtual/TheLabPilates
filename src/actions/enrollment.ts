'use server';

import { eq, and, sql, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { classEnrollments, openClasses, userSubscriptions, payments } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/types';

export async function enrollInClassAction(classId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'client') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!classId) {
    return { success: false, error: 'ID de clase no proporcionado.' };
  }

  // 1. Get user's active subscription with confirmed payment
  const userSubs = await db
    .select({
      userSub: userSubscriptions,
      payment: payments,
    })
    .from(userSubscriptions)
    .leftJoin(payments, eq(userSubscriptions.paymentId, payments.id))
    .where(
      and(
        eq(userSubscriptions.userId, session.sub),
        eq(userSubscriptions.active, true)
      )
    );

  // Find one with confirmed payment
  const activeSub = userSubs.find((row) => row.payment?.confirmed === true);

  if (!activeSub) {
    return { success: false, error: 'No tienes una suscripción activa.' };
  }

  const userSub = activeSub.userSub;

  // Check expiration
  if (userSub.expirationDate && new Date(userSub.expirationDate) < new Date()) {
    return { success: false, error: 'Tu suscripción ha expirado.' };
  }

  // Check session credits
  if (!userSub.daysRemaining || userSub.daysRemaining <= 0) {
    return { success: false, error: 'No tienes créditos de sesión disponibles.' };
  }

  // 2. Get the class and validate
  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, classId),
  });

  if (!openClass) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  if (openClass.status !== 'scheduled') {
    return { success: false, error: 'Esta clase no está disponible para inscripción.' };
  }

  if (openClass.classDate && new Date(openClass.classDate) < new Date()) {
    return { success: false, error: 'Esta clase ya pasó.' };
  }

  // 3. Check capacity
  const [enrollmentCount] = await db
    .select({ count: count() })
    .from(classEnrollments)
    .where(eq(classEnrollments.openClassId, classId));

  if (enrollmentCount.count >= (openClass.capacity ?? 0)) {
    return { success: false, error: 'Clase llena.' };
  }

  // 4. Check duplicate enrollment
  const existing = await db.query.classEnrollments.findFirst({
    where: and(
      eq(classEnrollments.openClassId, classId),
      eq(classEnrollments.userSubscriptionId, userSub.id)
    ),
  });

  if (existing) {
    return { success: false, error: 'Ya tienes una reservación para esta clase.' };
  }

  // 5. Atomic transaction: create enrollment + decrement days_remaining
  await db.transaction(async (tx) => {
    await tx.insert(classEnrollments).values({
      openClassId: classId,
      userSubscriptionId: userSub.id,
      status: 'pending',
    });

    await tx.execute(sql`
      UPDATE user_suscriptions
      SET days_remaining = days_remaining - 1
      WHERE id = ${userSub.id} AND days_remaining > 0
    `);
  });

  return { success: true, message: '¡Reservación confirmada!' };
}


export async function cancelReservationAction(enrollmentId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'client') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!enrollmentId) {
    return { success: false, error: 'ID de reservación no proporcionado.' };
  }

  // Get enrollment record
  const enrollment = await db.query.classEnrollments.findFirst({
    where: eq(classEnrollments.id, enrollmentId),
  });

  if (!enrollment) {
    return { success: false, error: 'Reservación no encontrada.' };
  }

  // Block cancellation for non-pending enrollments
  if (enrollment.status !== 'pending') {
    return { success: false, error: 'Solo puedes cancelar reservaciones pendientes.' };
  }

  // Get the class to check date
  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, enrollment.openClassId),
  });

  if (!openClass || !openClass.classDate) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  // Block cancellation for past classes
  if (new Date(openClass.classDate) < new Date()) {
    return { success: false, error: 'No puedes cancelar una clase que ya pasó.' };
  }

  // Check if ≥24h before class
  const hoursUntilClass = (new Date(openClass.classDate).getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilClass >= 24) {
    // Timely cancellation: delete enrollment + refund credit (atomic)
    try {
      await db.transaction(async (tx) => {
        await tx.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
        await tx.execute(sql`
          UPDATE user_suscriptions
          SET days_remaining = days_remaining + 1
          WHERE id = ${enrollment.userSubscriptionId}
        `);
      });
    } catch {
      return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
    }

    revalidatePath('/client/reservations');
    revalidatePath('/client');
    return { success: true, message: 'Reservación cancelada. Tu crédito ha sido restaurado.' };
  } else {
    // Late cancellation: signal to client that confirmation is needed
    return { success: false, error: 'LATE_CANCELLATION', field: 'late' };
  }
}

export async function confirmLateCancellationAction(enrollmentId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'client') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!enrollmentId) {
    return { success: false, error: 'ID de reservación no proporcionado.' };
  }

  // Get enrollment record
  const enrollment = await db.query.classEnrollments.findFirst({
    where: eq(classEnrollments.id, enrollmentId),
  });

  if (!enrollment) {
    return { success: false, error: 'Reservación no encontrada.' };
  }

  // Block for non-pending enrollments
  if (enrollment.status !== 'pending') {
    return { success: false, error: 'Solo puedes cancelar reservaciones pendientes.' };
  }

  // Get the class to check date
  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, enrollment.openClassId),
  });

  if (!openClass || !openClass.classDate) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  // Block cancellation for past classes
  if (new Date(openClass.classDate) < new Date()) {
    return { success: false, error: 'No puedes cancelar una clase que ya pasó.' };
  }

  // Late cancellation: set status to 'late_cancelled', no refund
  try {
    await db
      .update(classEnrollments)
      .set({ status: 'late_cancelled' })
      .where(eq(classEnrollments.id, enrollmentId));
  } catch {
    return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
  }

  revalidatePath('/client/reservations');
  revalidatePath('/client');
  return { success: true, message: 'Cancelación registrada. No se restaurará el crédito por cancelación tardía.' };
}
