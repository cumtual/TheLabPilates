'use server';

import { eq, and, sql, notInArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  classEnrollments,
  openClasses,
  guestEnrollments,
  guestCredits,
  userSubscriptions,
} from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { isUserOpenLabEligible } from '@/lib/guest/eligibility';
import { getGuestCreditsForCycle, consumeGuestCredit, restoreGuestCredit } from '@/lib/guest/credits';
import { getAvailableCapacity } from '@/lib/guest/capacity';
import type { GuestEligibilityResult } from '@/lib/types/guest';
import type { ActionResult } from '@/lib/types';

/**
 * Server action to check if the current authenticated user is eligible
 * to add a guest to a class reservation.
 *
 * Validates:
 * - Session exists and role is 'client'
 * - User has an active Open Lab membership (guest = true, payment confirmed, not expired)
 * - User has available guest credits for the current billing cycle
 *
 * On DB/connection errors, returns a descriptive error (req 1.5).
 */
export async function checkGuestEligibilityAction(): Promise<GuestEligibilityResult | null> {
  try {
    // Step 1: Validate session
    const session = await getSession();
    if (!session) {
      return {
        eligible: false,
        creditsAvailable: 0,
        reason: 'No autenticado.',
      };
    }

    if (session.role !== 'client') {
      return {
        eligible: false,
        creditsAvailable: 0,
        reason: 'No tienes permisos para esta acción.',
      };
    }

    // Step 2: Check base Open Lab eligibility
    const eligibility = await isUserOpenLabEligible(session.sub);

    if (!eligibility.eligible || !eligibility.userSubscription) {
      // No active Open Lab membership: the guest switch must not render.
      return null;
    }

    // Step 3: Check guest credits for the current billing cycle
    const creditsAvailable = await getGuestCreditsForCycle(
      session.sub,
      eligibility.userSubscription.id
    );

    if (creditsAvailable <= 0) {
      return {
        eligible: false,
        creditsAvailable: 0,
        reason: 'Ya utilizaste tu crédito de invitado en este ciclo.',
      };
    }

    return {
      eligible: true,
      creditsAvailable,
    };
  } catch {
    // Req 1.5: On DB/connection error, return descriptive error
    return {
      eligible: false,
      creditsAvailable: 0,
      reason: 'No se pudo verificar la elegibilidad. Intenta de nuevo.',
    };
  }
}

/**
 * Server action to reserve a class with a guest in a single atomic transaction.
 *
 * Validates:
 * - Session exists and role is 'client'
 * - Guest name is 2-100 characters (trimmed)
 * - User has active Open Lab membership (eligible)
 * - User has available guest credit for current billing cycle
 * - Class exists, is scheduled, and has at least 2 available spots
 * - User is not already enrolled in the class
 *
 * In a transaction:
 * - Locks the class row with SELECT ... FOR UPDATE to prevent race conditions
 * - Inserts class enrollment for the titular (no days_remaining decrement for Open Lab)
 * - Inserts guest enrollment with origin 'user'
 * - Consumes 1 guest credit
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 2.2
 */
export async function enrollWithGuestAction(
  classId: string,
  guestName: string
): Promise<ActionResult> {
  // Step 1: Validate session
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

  // Step 2: Validate guest name (2-100 characters, trimmed)
  const trimmedGuestName = guestName?.trim() ?? '';
  if (trimmedGuestName.length < 2) {
    return {
      success: false,
      error: 'El nombre del invitado debe tener al menos 2 caracteres.',
      field: 'guestName',
    };
  }
  if (trimmedGuestName.length > 100) {
    return {
      success: false,
      error: 'El nombre del invitado no puede exceder 100 caracteres.',
      field: 'guestName',
    };
  }

  // Step 3: Check Open Lab eligibility
  const eligibility = await isUserOpenLabEligible(session.sub);
  if (!eligibility.eligible || !eligibility.userSubscription) {
    return {
      success: false,
      error: 'Solo membresías Open Lab permiten invitados.',
    };
  }

  const userSubscriptionId = eligibility.userSubscription.id;

  // Step 4: Check guest credit availability
  const creditsAvailable = await getGuestCreditsForCycle(session.sub, userSubscriptionId);
  if (creditsAvailable <= 0) {
    return {
      success: false,
      error: 'Ya utilizaste tu crédito de invitado en este ciclo.',
    };
  }

  // Step 5: Validate class exists and is reservable
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

  // Step 6: Check capacity >= 2 (needs 2 spots: titular + guest)
  const availableCapacity = await getAvailableCapacity(classId);
  if (availableCapacity < 2) {
    return {
      success: false,
      error: 'No hay cupos suficientes para ti y tu invitado.',
    };
  }

  // Step 7: Check duplicate enrollment (prevent same user enrolling twice)
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

  // Step 8: Atomic transaction with SELECT ... FOR UPDATE
  try {
    await db.transaction(async (tx) => {
      // Lock the class row to prevent race conditions on capacity
      await tx.execute(
        sql`SELECT id FROM open_class WHERE id = ${classId} FOR UPDATE`
      );

      // Re-check capacity inside transaction (after lock)
      const [enrolledCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.openClassId, classId),
            notInArray(classEnrollments.status, ['cancelled', 'late_cancelled'])
          )
        );

      const [guestCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(guestEnrollments)
        .where(
          and(
            eq(guestEnrollments.openClassId, classId),
            notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
          )
        );

      const totalOccupied =
        Number(enrolledCount?.count ?? 0) + Number(guestCount?.count ?? 0);
      const capacity = openClass.capacity ?? 0;

      if (capacity - totalOccupied < 2) {
        throw new Error('NO_CAPACITY');
      }

      // Insert titular enrollment (no days_remaining decrement for Open Lab)
      await tx.insert(classEnrollments).values({
        openClassId: classId,
        userSubscriptionId: userSubscriptionId,
        status: 'pending',
      });

      // Insert guest enrollment
      const [insertedGuest] = await tx
        .insert(guestEnrollments)
        .values({
          openClassId: classId,
          guestName: trimmedGuestName,
          origin: 'user',
          registeredById: session.sub,
          status: 'pending',
        })
        .returning({ id: guestEnrollments.id });

      // Consume guest credit atomically within the transaction
      // (consumeGuestCredit uses its own transaction, so we replicate the logic here)
      const [existingCredit] = await tx
        .select()
        .from(guestCredits)
        .where(
          and(
            eq(guestCredits.userId, session.sub),
            eq(guestCredits.userSubscriptionId, userSubscriptionId)
          )
        );

      if (existingCredit) {
        if (existingCredit.creditsUsed >= 1) {
          throw new Error('NO_CREDITS');
        }
        await tx.execute(
          sql`UPDATE guest_credits SET credits_used = 1, guest_enrollment_id = ${insertedGuest.id} WHERE id = ${existingCredit.id} AND credits_used = 0`
        );
      } else {
        await tx.execute(
          sql`INSERT INTO guest_credits (user_id, user_subscription_id, credits_used, guest_enrollment_id) VALUES (${session.sub}, ${userSubscriptionId}, 1, ${insertedGuest.id})`
        );
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NO_CAPACITY') {
        return {
          success: false,
          error: 'No hay cupos suficientes para ti y tu invitado.',
        };
      }
      if (error.message === 'NO_CREDITS') {
        return {
          success: false,
          error: 'Ya utilizaste tu crédito de invitado en este ciclo.',
        };
      }
    }
    return {
      success: false,
      error: 'No se pudo completar la reserva. Intenta de nuevo.',
    };
  }

  revalidatePath('/client');
  revalidatePath('/client/classes');
  revalidatePath('/client/reservations');
  revalidatePath('/client/subscription');
  revalidatePath('/');
  return { success: true, message: '¡Reservación con invitado confirmada!' };
}


/**
 * Server action to add a guest to an existing reservation.
 *
 * Validates:
 * - Session exists and role is 'client'
 * - Guest name is 2-100 characters (trimmed)
 * - Enrollment exists, belongs to the user, has status 'pending'
 * - Class has not passed
 * - User doesn't already have an active guest for this class
 * - User has Open Lab eligibility and available guest credit
 * - Class has at least 1 available spot
 *
 * Atomically: creates guest_enrollment + consumes guest credit.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10
 */
export async function addGuestToReservationAction(
  enrollmentId: string,
  guestName: string
): Promise<ActionResult> {
  try {
    // Step 1: Validate session and role
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'No autenticado.' };
    }
    if (session.role !== 'client') {
      return { success: false, error: 'No tienes permisos para esta acción.' };
    }

    // Step 2: Validate guest name (2-100 chars)
    const trimmedName = guestName?.trim() ?? '';
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return {
        success: false,
        error: 'El nombre del invitado debe tener entre 2 y 100 caracteres.',
        field: 'guestName',
      };
    }

    // Step 3: Get enrollment and validate it exists + belongs to user + is pending
    if (!enrollmentId) {
      return { success: false, error: 'ID de reservación no proporcionado.' };
    }

    const enrollmentRow = await db
      .select({
        enrollment: classEnrollments,
        userSubscription: userSubscriptions,
      })
      .from(classEnrollments)
      .innerJoin(
        userSubscriptions,
        eq(classEnrollments.userSubscriptionId, userSubscriptions.id)
      )
      .where(eq(classEnrollments.id, enrollmentId))
      .then((rows) => rows[0] ?? null);

    if (!enrollmentRow) {
      return { success: false, error: 'Reservación no encontrada.' };
    }

    // Verify the enrollment belongs to the authenticated user
    if (enrollmentRow.userSubscription.userId !== session.sub) {
      return { success: false, error: 'No tienes permisos para esta acción.' };
    }

    // Verify status is 'pending'
    if (enrollmentRow.enrollment.status !== 'pending') {
      return { success: false, error: 'Solo puedes agregar un invitado a reservaciones pendientes.' };
    }

    const classId = enrollmentRow.enrollment.openClassId;

    // Step 4: Check that the class hasn't passed (req 9.10)
    const openClass = await db.query.openClasses.findFirst({
      where: eq(openClasses.id, classId),
    });

    if (!openClass || !openClass.classDate) {
      return { success: false, error: 'Clase no encontrada.' };
    }

    if (new Date(openClass.classDate) < new Date()) {
      return { success: false, error: 'No puedes agregar un invitado a una clase que ya pasó.' };
    }

    // Step 5: Check user doesn't already have an active guest for this class (req 9.9)
    const existingGuest = await db
      .select({ id: guestEnrollments.id })
      .from(guestEnrollments)
      .where(
        and(
          eq(guestEnrollments.openClassId, classId),
          eq(guestEnrollments.registeredById, session.sub),
          notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
        )
      );

    if (existingGuest.length > 0) {
      return { success: false, error: 'Ya tienes un invitado registrado en esta clase.' };
    }

    // Step 6: Check Open Lab eligibility + credits (req 9.5, 9.7)
    const eligibility = await isUserOpenLabEligible(session.sub);

    if (!eligibility.eligible || !eligibility.userSubscription) {
      return { success: false, error: 'No tienes una membresía Open Lab activa.' };
    }

    const userSubscriptionId = eligibility.userSubscription.id;

    const creditsAvailable = await getGuestCreditsForCycle(session.sub, userSubscriptionId);

    if (creditsAvailable <= 0) {
      return {
        success: false,
        error: 'Ya utilizaste tu crédito de invitado en este ciclo.',
      };
    }

    // Step 7: Check available capacity >= 1 (req 9.2, 9.5, 9.6)
    const availableCapacity = await getAvailableCapacity(classId);

    if (availableCapacity < 1) {
      return { success: false, error: 'No hay cupos disponibles para tu invitado.' };
    }

    // Step 8: Atomic transaction — INSERT guest_enrollment + consume credit (req 9.8)
    await db.transaction(async (tx) => {
      // Lock the class row to prevent race conditions on capacity
      await tx.execute(
        sql`SELECT id FROM open_class WHERE id = ${classId} FOR UPDATE`
      );

      // Re-check capacity inside transaction (after lock)
      const [enrolledCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.openClassId, classId),
            notInArray(classEnrollments.status, ['cancelled', 'late_cancelled'])
          )
        );

      const [guestCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(guestEnrollments)
        .where(
          and(
            eq(guestEnrollments.openClassId, classId),
            notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
          )
        );

      const totalOccupied =
        Number(enrolledCount?.count ?? 0) + Number(guestCount?.count ?? 0);
      const capacity = openClass.capacity ?? 0;

      if (capacity - totalOccupied < 1) {
        throw new Error('NO_CAPACITY');
      }

      // Re-check credits atomically
      const [existingCredit] = await tx
        .select()
        .from(guestCredits)
        .where(
          and(
            eq(guestCredits.userId, session.sub),
            eq(guestCredits.userSubscriptionId, userSubscriptionId)
          )
        );

      if (existingCredit && existingCredit.creditsUsed >= 1) {
        throw new Error('NO_CREDITS');
      }

      // Create the guest enrollment
      const [insertedGuest] = await tx
        .insert(guestEnrollments)
        .values({
          openClassId: classId,
          guestName: trimmedName,
          origin: 'user',
          registeredById: session.sub,
          status: 'pending',
        })
        .returning({ id: guestEnrollments.id });

      // Consume guest credit within the transaction
      if (existingCredit) {
        await tx.execute(
          sql`UPDATE guest_credits SET credits_used = 1, guest_enrollment_id = ${insertedGuest.id} WHERE id = ${existingCredit.id} AND credits_used = 0`
        );
      } else {
        await tx.execute(
          sql`INSERT INTO guest_credits (user_id, user_subscription_id, credits_used, guest_enrollment_id) VALUES (${session.sub}, ${userSubscriptionId}, 1, ${insertedGuest.id})`
        );
      }
    });

    // Step 9: Revalidate paths
    revalidatePath('/client');
    revalidatePath('/client/reservations');
    revalidatePath('/client/classes');
    revalidatePath('/');

    return { success: true, message: '¡Invitado agregado exitosamente!' };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NO_CAPACITY') {
        return {
          success: false,
          error: 'No hay cupos disponibles para tu invitado.',
        };
      }
      if (error.message === 'NO_CREDITS') {
        return {
          success: false,
          error: 'Ya utilizaste tu crédito de invitado en este ciclo.',
        };
      }
    }
    return {
      success: false,
      error: 'No se pudo agregar el invitado. Intenta de nuevo.',
    };
  }
}


/**
 * Server action to cancel only the guest from a reservation.
 *
 * Flow:
 * 1. Validate session and role 'client'
 * 2. Get the guest enrollment → reject if not found or not active (status 'pending')
 * 3. Verify the current user is the one who registered the guest
 * 4. Get the associated class → get classDate
 * 5. Calculate hours until class
 * 6. If > 24h: cancel guest + restore credit
 * 7. If <= 24h: return LATE_CANCELLATION signal to UI
 *
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.6
 */
export async function cancelGuestAction(
  guestEnrollmentId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'client') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!guestEnrollmentId) {
    return { success: false, error: 'ID de inscripción de invitado no proporcionado.' };
  }

  // Get guest enrollment
  const guestEnrollment = await db.query.guestEnrollments.findFirst({
    where: eq(guestEnrollments.id, guestEnrollmentId),
  });

  if (!guestEnrollment) {
    return { success: false, error: 'Inscripción de invitado no encontrada.' };
  }

  // Only allow cancelling active (pending) enrollments
  if (guestEnrollment.status !== 'pending') {
    return { success: false, error: 'Solo puedes cancelar inscripciones pendientes.' };
  }

  // Verify ownership: only the user who registered the guest can cancel
  if (guestEnrollment.registeredById !== session.sub) {
    return { success: false, error: 'No tienes permisos para cancelar este invitado.' };
  }

  // Get the associated class to determine class date
  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, guestEnrollment.openClassId),
  });

  if (!openClass || !openClass.classDate) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  // Block cancellation for past classes
  if (new Date(openClass.classDate) < new Date()) {
    return { success: false, error: 'No puedes cancelar una inscripción de una clase que ya pasó.' };
  }

  // Calculate hours until class
  const hoursUntilClass =
    (new Date(openClass.classDate).getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilClass > 24) {
    // Timely cancellation: cancel guest + restore credit
    try {
      // Get user subscription to restore credit
      const eligibility = await isUserOpenLabEligible(session.sub);
      if (!eligibility.eligible || !eligibility.userSubscription) {
        // Fallback: cancel without credit restoration if membership not found
        await db
          .update(guestEnrollments)
          .set({ status: 'cancelled' })
          .where(eq(guestEnrollments.id, guestEnrollmentId));
      } else {
        await db.transaction(async (tx) => {
          await tx
            .update(guestEnrollments)
            .set({ status: 'cancelled' })
            .where(eq(guestEnrollments.id, guestEnrollmentId));
        });

        // Restore guest credit (outside transaction since restoreGuestCredit handles its own)
        await restoreGuestCredit(session.sub, eligibility.userSubscription.id);
      }
    } catch {
      return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
    }

    revalidatePath('/client');
    revalidatePath('/client/reservations');
    revalidatePath('/');
    return { success: true, message: 'Invitado cancelado. Tu crédito de invitado ha sido restaurado.' };
  } else {
    // Late cancellation: return signal for UI to show confirmation dialog
    return { success: false, error: 'LATE_CANCELLATION' };
  }
}

/**
 * Server action to confirm late cancellation of only the guest.
 * Called after the user sees the late cancellation warning and confirms.
 *
 * Cancels the guest enrollment without restoring the guest credit.
 * Liberates 1 spot in the class.
 *
 * Requirements: 4.5
 */
export async function confirmLateCancelGuestAction(
  guestEnrollmentId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'client') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!guestEnrollmentId) {
    return { success: false, error: 'ID de inscripción de invitado no proporcionado.' };
  }

  // Get guest enrollment
  const guestEnrollment = await db.query.guestEnrollments.findFirst({
    where: eq(guestEnrollments.id, guestEnrollmentId),
  });

  if (!guestEnrollment) {
    return { success: false, error: 'Inscripción de invitado no encontrada.' };
  }

  if (guestEnrollment.status !== 'pending') {
    return { success: false, error: 'Solo puedes cancelar inscripciones pendientes.' };
  }

  // Verify ownership
  if (guestEnrollment.registeredById !== session.sub) {
    return { success: false, error: 'No tienes permisos para cancelar este invitado.' };
  }

  // Cancel the guest enrollment without restoring credit
  try {
    await db
      .update(guestEnrollments)
      .set({ status: 'cancelled' })
      .where(eq(guestEnrollments.id, guestEnrollmentId));
  } catch {
    return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
  }

  revalidatePath('/client');
  revalidatePath('/client/reservations');
  revalidatePath('/');
  return {
    success: true,
    message: 'Invitado cancelado. El crédito de invitado no será reembolsado por cancelación tardía.',
  };
}

/**
 * Server action to cancel both the titular enrollment and the guest enrollment.
 *
 * Flow:
 * 1. Validate session and role 'client'
 * 2. Get the titular enrollment → reject if not 'pending'
 * 3. Find associated active guest enrollment (same class, registeredById = session.sub)
 * 4. Get class date, calculate hours
 * 5. If > 24h: in transaction: cancel enrollment + cancel guest + restore credit
 * 6. If <= 24h: return LATE_CANCELLATION signal
 *
 * Requirements: 4.7, 4.8, 4.9, 4.10
 */
export async function cancelReservationWithGuestAction(
  enrollmentId: string
): Promise<ActionResult> {
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

  // Get the titular enrollment
  const enrollment = await db.query.classEnrollments.findFirst({
    where: eq(classEnrollments.id, enrollmentId),
  });

  if (!enrollment) {
    return { success: false, error: 'Reservación no encontrada.' };
  }

  if (enrollment.status !== 'pending') {
    return { success: false, error: 'Solo puedes cancelar reservaciones pendientes.' };
  }

  // Find the associated active guest enrollment for this class by this user
  const activeGuest = await db.query.guestEnrollments.findFirst({
    where: and(
      eq(guestEnrollments.openClassId, enrollment.openClassId),
      eq(guestEnrollments.registeredById, session.sub),
      notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
    ),
  });

  if (!activeGuest) {
    return { success: false, error: 'No se encontró un invitado asociado a esta reserva.' };
  }

  // Get the class for date calculation
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

  // Calculate hours until class
  const hoursUntilClass =
    (new Date(openClass.classDate).getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilClass > 24) {
    // Timely cancellation: cancel both + restore credit
    try {
      await db.transaction(async (tx) => {
        // Cancel the titular enrollment
        await tx
          .update(classEnrollments)
          .set({ status: 'cancelled' })
          .where(eq(classEnrollments.id, enrollmentId));

        // Cancel the guest enrollment
        await tx
          .update(guestEnrollments)
          .set({ status: 'cancelled' })
          .where(eq(guestEnrollments.id, activeGuest.id));
      });

      // Restore guest credit
      // Get the user subscription from the enrollment
      const userSub = await db.query.userSubscriptions.findFirst({
        where: eq(userSubscriptions.id, enrollment.userSubscriptionId),
      });

      if (userSub) {
        await restoreGuestCredit(session.sub, userSub.id);
      }
    } catch {
      return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
    }

    revalidatePath('/client');
    revalidatePath('/client/reservations');
    revalidatePath('/client/subscription');
    revalidatePath('/');
    return {
      success: true,
      message: 'Reservación y invitado cancelados. Tu crédito de invitado ha sido restaurado.',
    };
  } else {
    // Late cancellation: return signal for UI to show confirmation dialog
    return { success: false, error: 'LATE_CANCELLATION' };
  }
}

/**
 * Server action to confirm late cancellation of both titular and guest enrollments.
 * Called after the user sees the late cancellation warning and confirms.
 *
 * Marks:
 * - Titular enrollment as 'late_cancelled'
 * - Guest enrollment as 'cancelled'
 * Liberates 2 spots in the class. Does NOT restore guest credit.
 *
 * Requirements: 4.9
 */
export async function confirmLateCancelBothAction(
  enrollmentId: string
): Promise<ActionResult> {
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

  // Get the titular enrollment
  const enrollment = await db.query.classEnrollments.findFirst({
    where: eq(classEnrollments.id, enrollmentId),
  });

  if (!enrollment) {
    return { success: false, error: 'Reservación no encontrada.' };
  }

  if (enrollment.status !== 'pending') {
    return { success: false, error: 'Solo puedes cancelar reservaciones pendientes.' };
  }

  // Find the associated active guest enrollment
  const activeGuest = await db.query.guestEnrollments.findFirst({
    where: and(
      eq(guestEnrollments.openClassId, enrollment.openClassId),
      eq(guestEnrollments.registeredById, session.sub),
      notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
    ),
  });

  if (!activeGuest) {
    return { success: false, error: 'No se encontró un invitado asociado a esta reserva.' };
  }

  // Execute atomic late cancellation: titular as 'late_cancelled', guest as 'cancelled'
  try {
    await db.transaction(async (tx) => {
      // Mark titular as 'late_cancelled'
      await tx
        .update(classEnrollments)
        .set({ status: 'late_cancelled' })
        .where(eq(classEnrollments.id, enrollmentId));

      // Mark guest as 'cancelled'
      await tx
        .update(guestEnrollments)
        .set({ status: 'cancelled' })
        .where(eq(guestEnrollments.id, activeGuest.id));
    });
  } catch {
    return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
  }

  revalidatePath('/client');
  revalidatePath('/client/reservations');
  revalidatePath('/');
  return {
    success: true,
    message: 'Cancelación registrada. No se restaurará el crédito por cancelación tardía.',
  };
}
