'use server';

import { eq, and, sql, notInArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { classEnrollments, openClasses, userSubscriptions, payments, subscriptions, guestEnrollments } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { getAvailableCapacity } from '@/lib/guest/capacity';
import { isWithinGracePeriod } from '@/lib/utils/date';
import { generateCheckinToken } from '@/lib/checkin/token';
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
      subscription: subscriptions,
    })
    .from(userSubscriptions)
    .leftJoin(payments, eq(userSubscriptions.paymentId, payments.id))
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(
      and(
        eq(userSubscriptions.userId, session.sub),
        eq(userSubscriptions.active, true)
      )
    );

  // Find a usable subscription: confirmed payment, not expired, has credits (or is Open Lab)
  const now = new Date();
  const activeSub = userSubs.find((row) => {
    if (!row.payment?.confirmed) return false;
    if (row.userSub.expirationDate && new Date(row.userSub.expirationDate) < now) return false;
    // Open Lab (guest = true) doesn't use days_remaining — unlimited classes
    const isOpenLab = row.subscription?.guest === true;
    if (!isOpenLab) {
      if (!row.userSub.daysRemaining || row.userSub.daysRemaining <= 0) return false;
    }
    return true;
  });

  if (!activeSub) {
    // Give a more specific error message
    const hasAnySub = userSubs.some((row) => row.payment?.confirmed === true);
    if (!hasAnySub) {
      return { success: false, error: 'No tienes una suscripción activa.' };
    }
    const hasExpired = userSubs.some((row) =>
      row.payment?.confirmed && row.userSub.expirationDate && new Date(row.userSub.expirationDate) < now
    );
    if (hasExpired) {
      return { success: false, error: 'Tu suscripción ha expirado.' };
    }
    return { success: false, error: 'No tienes créditos de sesión disponibles.' };
  }

  const userSub = activeSub.userSub;
  const isOpenLab = activeSub.subscription?.guest === true;

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

  // 3. Check capacity (count active enrollments + guest enrollments)
  const availableCapacity = await getAvailableCapacity(classId);

  if (availableCapacity < 1) {
    return { success: false, error: 'Clase llena.' };
  }

  // 4. Check duplicate enrollment (by user, not subscription — prevent same user enrolling twice)
  const existingEnrollments = await db
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
    .where(
      and(
        eq(classEnrollments.openClassId, classId),
        eq(userSubscriptions.userId, session.sub),
        notInArray(classEnrollments.status, ['cancelled', 'late_cancelled'])
      )
    );

  if (existingEnrollments.length > 0) {
    return { success: false, error: 'Ya estás inscrito en esta clase.' };
  }

  // 5. Atomic transaction with row lock: re-verify capacity + duplicate INSIDE the
  //    transaction so concurrent enrollments cannot overbook the class (CWE-362).
  let txError: string | null = null;

  await db.transaction(async (tx) => {
    // Lock the class row — serializes concurrent enrollments for this class.
    await tx.execute(sql`SELECT id FROM open_class WHERE id = ${classId} FOR UPDATE`);

    // Re-verify capacity under the lock.
    const availableUnderLock = await getAvailableCapacity(classId, tx);
    if (availableUnderLock < 1) {
      txError = 'Clase llena.';
      tx.rollback();
    }

    // Re-verify duplicate enrollment under the lock.
    const duplicateUnderLock = await tx
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
      .where(
        and(
          eq(classEnrollments.openClassId, classId),
          eq(userSubscriptions.userId, session.sub),
          notInArray(classEnrollments.status, ['cancelled', 'late_cancelled'])
        )
      );

    if (duplicateUnderLock.length > 0) {
      txError = 'Ya estás inscrito en esta clase.';
      tx.rollback();
    }

    await tx.insert(classEnrollments).values({
      openClassId: classId,
      userSubscriptionId: userSub.id,
      status: 'pending',
      checkinToken: generateCheckinToken(),
    });

    // Open Lab memberships don't use days_remaining — unlimited classes
    if (!isOpenLab) {
      await tx.execute(sql`
        UPDATE user_suscriptions
        SET days_remaining = days_remaining - 1
        WHERE id = ${userSub.id} AND days_remaining > 0
      `);
    }
  });

  if (txError) {
    return { success: false, error: txError };
  }

  revalidatePath('/client');
  revalidatePath('/client/classes');
  revalidatePath('/client/reservations');
  revalidatePath('/client/subscription');
  revalidatePath('/');
  return { success: true, message: '¡Reservación confirmada!' };
}


async function isOpenLabEnrollment(userSubscriptionId: string): Promise<boolean> {
  const [subRow] = await db
    .select({ guest: subscriptions.guest })
    .from(userSubscriptions)
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(eq(userSubscriptions.id, userSubscriptionId));

  return subRow?.guest === true;
}

async function refundEnrollment(
  enrollmentId: string,
  userSubscriptionId: string,
  isOpenLab: boolean
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));

      // Open Lab memberships don't use days_remaining — skip increment
      if (!isOpenLab) {
        await tx.execute(sql`
          UPDATE user_suscriptions
          SET days_remaining = days_remaining + 1
          WHERE id = ${userSubscriptionId}
        `);
      }
    });
    return true;
  } catch {
    return false;
  }
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

  // Get enrollment + verify ownership in a single query (IDOR guard / CWE-639)
  const enrollmentRow = await db
    .select({ enrollment: classEnrollments, userSubscription: userSubscriptions })
    .from(classEnrollments)
    .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
    .where(eq(classEnrollments.id, enrollmentId))
    .then((rows) => rows[0] ?? null);

  if (!enrollmentRow) {
    return { success: false, error: 'Reservación no encontrada.' };
  }

  // The enrollment must belong to the authenticated user.
  if (enrollmentRow.userSubscription.userId !== session.sub) {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const enrollment = enrollmentRow.enrollment;

  // Block cancellation for non-pending enrollments
  if (enrollment.status !== 'pending') {
    return { success: false, error: 'Solo puedes cancelar reservaciones pendientes.' };
  }

  // Determine if the subscription is Open Lab (guest = true)
  const [subRow] = await db
    .select({ guest: subscriptions.guest })
    .from(userSubscriptions)
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(eq(userSubscriptions.id, enrollment.userSubscriptionId));

  const isOpenLab = subRow?.guest === true;

  // Check if the reservation has an associated active guest in guest_enrollments
  const activeGuest = await db
    .select({ id: guestEnrollments.id })
    .from(guestEnrollments)
    .where(
      and(
        eq(guestEnrollments.openClassId, enrollment.openClassId),
        eq(guestEnrollments.registeredById, session.sub),
        notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
      )
    );

  if (activeGuest.length > 0) {
    // Signal to UI that this reservation has an associated guest — show cancel options dialog
    return {
      success: false,
      error: 'HAS_GUEST',
      field: activeGuest[0].id,
    };
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

  // Check if ≥24h before class OR within the 10-min grace window
  const hoursUntilClass = (new Date(openClass.classDate).getTime() - Date.now()) / (1000 * 60 * 60);
  const withinGrace = isWithinGracePeriod(enrollment.createdAt);

  if (hoursUntilClass >= 24 || withinGrace) {
    // Timely or grace cancellation: delete enrollment + refund credit (atomic)
    const refunded = await refundEnrollment(
      enrollmentId,
      enrollment.userSubscriptionId,
      isOpenLab
    );

    if (!refunded) {
      return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
    }

    revalidatePath('/client/reservations');
    revalidatePath('/client');
    revalidatePath('/');
    return {
      success: true,
      message:
        withinGrace && hoursUntilClass < 24
          ? 'Cancelada dentro de los 10 minutos de tolerancia. Tu crédito ha sido restaurado.'
          : 'Reservación cancelada. Tu crédito ha sido restaurado.',
    };
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

  // Get enrollment + verify ownership in a single query (IDOR guard / CWE-639)
  const enrollmentRow = await db
    .select({ enrollment: classEnrollments, userSubscription: userSubscriptions })
    .from(classEnrollments)
    .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
    .where(eq(classEnrollments.id, enrollmentId))
    .then((rows) => rows[0] ?? null);

  if (!enrollmentRow) {
    return { success: false, error: 'Reservación no encontrada.' };
  }

  // The enrollment must belong to the authenticated user.
  if (enrollmentRow.userSubscription.userId !== session.sub) {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const enrollment = enrollmentRow.enrollment;

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

  // The user may have opened the late-cancel dialog while still inside the grace
  // window and confirmed after it lapsed. Re-evaluate: ≥24h OR within grace → refund.
  const hoursUntilClass =
    (new Date(openClass.classDate).getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilClass >= 24 || isWithinGracePeriod(enrollment.createdAt)) {
    const isOpenLab = await isOpenLabEnrollment(enrollment.userSubscriptionId);
    const refunded = await refundEnrollment(
      enrollmentId,
      enrollment.userSubscriptionId,
      isOpenLab
    );

    if (!refunded) {
      return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
    }

    revalidatePath('/client/reservations');
    revalidatePath('/client');
    revalidatePath('/');
    return { success: true, message: 'Reservación cancelada. Tu crédito ha sido restaurado.' };
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
  revalidatePath('/');
  return { success: true, message: 'Cancelación registrada. No se restaurará el crédito por cancelación tardía.' };
}
