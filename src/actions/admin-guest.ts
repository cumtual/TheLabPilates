'use server';

import { eq, and, sql, notInArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { openClasses, guestEnrollments } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { getAvailableCapacity } from '@/lib/guest/capacity';
import type { ActionResult } from '@/lib/types';

/**
 * Admin: add a guest to a class manually.
 *
 * Validates:
 * - Session exists and role is 'admin'
 * - Guest name is 1-100 characters (trimmed)
 * - Class exists, is scheduled, and has at least 1 available spot
 *
 * Creates a guest_enrollment with origin 'admin'.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export async function adminAddGuestAction(
  classId: string,
  guestName: string
): Promise<ActionResult> {
  // Step 1: Validate session and role
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!classId) {
    return { success: false, error: 'ID de clase no proporcionado.' };
  }

  // Step 2: Validate guest name (1-100 characters for admin, trimmed)
  const trimmedGuestName = guestName?.trim() ?? '';
  if (trimmedGuestName.length < 1) {
    return {
      success: false,
      error: 'El nombre del invitado es obligatorio.',
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

  // Step 3: Validate class exists and is scheduled
  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, classId),
  });

  if (!openClass) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  if (openClass.status !== 'scheduled') {
    return { success: false, error: 'Esta clase no está disponible para inscripción.' };
  }

  // Step 4: Check available capacity >= 1
  const availableCapacity = await getAvailableCapacity(classId);
  if (availableCapacity < 1) {
    return { success: false, error: 'No hay cupos disponibles.' };
  }

  // Step 5: Atomic insertion with capacity lock
  try {
    await db.transaction(async (tx) => {
      // Lock the class row to prevent race conditions
      await tx.execute(
        sql`SELECT id FROM open_class WHERE id = ${classId} FOR UPDATE`
      );

      // Re-check capacity inside transaction
      const [enrolledCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(guestEnrollments)
        .where(
          and(
            eq(guestEnrollments.openClassId, classId),
            notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
          )
        );

      // Also count regular enrollments via raw query for total occupancy
      const [{ count: regularCount }] = await tx.execute(
        sql`SELECT count(*) as count FROM class_enrolleds WHERE open_class_id = ${classId} AND status NOT IN ('cancelled', 'late_cancelled')`
      ) as unknown as [{ count: number }];

      const totalOccupied = Number(enrolledCount?.count ?? 0) + Number(regularCount ?? 0);
      const capacity = openClass.capacity ?? 0;

      if (capacity - totalOccupied < 1) {
        throw new Error('NO_CAPACITY');
      }

      // Insert guest enrollment with origin 'admin'
      await tx.insert(guestEnrollments).values({
        openClassId: classId,
        guestName: trimmedGuestName,
        origin: 'admin',
        registeredById: session.sub,
        status: 'pending',
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NO_CAPACITY') {
      return { success: false, error: 'No hay cupos disponibles.' };
    }
    return { success: false, error: 'No se pudo agregar el invitado. Intenta de nuevo.' };
  }

  revalidatePath('/admin/classes');
  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath(`/admin/attendance/${classId}`);
  revalidatePath('/');
  return { success: true, message: '¡Invitado agregado exitosamente!' };
}

/**
 * Admin: remove a guest from a class.
 *
 * Validates:
 * - Session exists and role is 'admin'
 * - Guest enrollment exists
 * - Guest enrollment has origin = 'admin' (cannot remove user-added guests)
 *
 * Marks the guest enrollment as 'cancelled' to liberate 1 spot.
 * The confirmation dialog is handled by the UI before calling this action.
 *
 * Requirements: 6.6, 6.7, 6.8
 */
export async function adminRemoveGuestAction(
  guestEnrollmentId: string
): Promise<ActionResult> {
  // Step 1: Validate session and role
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!guestEnrollmentId) {
    return { success: false, error: 'ID de inscripción de invitado no proporcionado.' };
  }

  // Step 2: Get the guest enrollment
  const guestEnrollment = await db.query.guestEnrollments.findFirst({
    where: eq(guestEnrollments.id, guestEnrollmentId),
  });

  if (!guestEnrollment) {
    return { success: false, error: 'Inscripción de invitado no encontrada.' };
  }

  // Step 3: Verify origin = 'admin' — reject if 'user' (Req 6.8)
  if (guestEnrollment.origin !== 'admin') {
    return {
      success: false,
      error: 'Solo puedes eliminar invitados registrados por administrador.',
    };
  }

  // Step 4: Verify the enrollment is in an active/removable state
  if (guestEnrollment.status === 'cancelled' || guestEnrollment.status === 'late_cancelled') {
    return { success: false, error: 'Este invitado ya fue cancelado.' };
  }

  // Step 5: Atomically mark as cancelled to liberate 1 spot (Req 6.7)
  try {
    await db.transaction(async (tx) => {
      // Lock the class row to ensure atomic capacity update
      await tx.execute(
        sql`SELECT id FROM open_class WHERE id = ${guestEnrollment.openClassId} FOR UPDATE`
      );

      // Cancel the guest enrollment
      await tx
        .update(guestEnrollments)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(guestEnrollments.id, guestEnrollmentId),
            notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
          )
        );
    });
  } catch {
    return { success: false, error: 'No se pudo eliminar el invitado. Intenta de nuevo.' };
  }

  revalidatePath('/admin/classes');
  revalidatePath(`/admin/classes/${guestEnrollment.openClassId}`);
  revalidatePath(`/admin/attendance/${guestEnrollment.openClassId}`);
  revalidatePath('/');
  return { success: true, message: 'Invitado eliminado exitosamente.' };
}
