'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { openClasses, classEnrollments, guestEnrollments } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/types';
import { parseDateTimeLocalAsMexicoCity } from '@/lib/utils/date';
import { checkAndExpireSubscriptions } from '@/lib/queries/check-subscription-expiration';
import { getTotalOccupied } from '@/lib/guest/capacity';

interface AttendanceRecord {
  enrollmentId: string;
  status: 'attended' | 'absent';
}

export async function updateAttendanceAction(
  classId: string,
  records: AttendanceRecord[]
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'coach' && session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!classId) {
    return { success: false, error: 'ID de clase no proporcionado.' };
  }

  if (!records || records.length === 0) {
    return { success: false, error: 'No se proporcionaron registros de asistencia.' };
  }

  // Get the class and verify it belongs to this coach
  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, classId),
  });

  if (!openClass) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  // Admins can manage any class; coaches can only manage their own
  if (session.role !== 'admin' && openClass.coachUserId !== session.sub) {
    return { success: false, error: 'No tienes permisos para esta clase.' };
  }

  // Validate class date is in the past (Req 8.4, 8.5)
  if (!openClass.classDate || new Date(openClass.classDate) > new Date()) {
    return { success: false, error: 'No puedes registrar asistencia de una clase futura.' };
  }

  // Update each enrollment status in both tables
  // Guest enrollment IDs are in guestEnrollments table, not classEnrollments
  for (const record of records) {
    // Update classEnrollments (for regular enrollments)
    await db
      .update(classEnrollments)
      .set({ status: record.status })
      .where(eq(classEnrollments.id, record.enrollmentId));

    // Also update guestEnrollments (for guest enrollments)
    await db
      .update(guestEnrollments)
      .set({ status: record.status })
      .where(eq(guestEnrollments.id, record.enrollmentId));
  }

  return { success: true, message: 'Asistencia registrada exitosamente.' };
}

export async function completeClassAction(
  classId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'coach' && session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!classId) {
    return { success: false, error: 'ID de clase no proporcionado.' };
  }

  // Get the class and verify ownership
  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, classId),
  });

  if (!openClass) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  // Admins can complete any class; coaches can only complete their own
  if (session.role !== 'admin' && openClass.coachUserId !== session.sub) {
    return { success: false, error: 'No tienes permisos para esta clase.' };
  }

  // Validate class date is in the past
  if (!openClass.classDate || new Date(openClass.classDate) > new Date()) {
    return { success: false, error: 'No puedes completar una clase futura.' };
  }

  // Verify class status is 'scheduled'
  if (openClass.status !== 'scheduled') {
    return { success: false, error: 'Solo se pueden completar clases programadas.' };
  }

  // Mark class as completed
  await db
    .update(openClasses)
    .set({ status: 'completed' })
    .where(eq(openClasses.id, classId));

  // Check and expire subscriptions linked to this completed class
  await checkAndExpireSubscriptions(classId);

  revalidatePath('/coach/classes');
  revalidatePath('/');
  return { success: true, message: 'Clase completada exitosamente.' };
}

export interface UpdateClassScheduleInput {
  classDate?: string;
  capacity?: string | number;
}

/**
 * Edita ÚNICAMENTE la fecha/hora y los cupos de una clase programada.
 *
 * - Admin: puede editar cualquier clase de cualquier coach.
 * - Coach: solo clases propias (`coachUserId === session.sub`); en caso contrario se
 *   rechaza (equivalente a 403 Forbidden dentro del contrato ActionResult).
 * - Coach NO puede cancelar: cualquier campo distinto de `classDate`/`capacity`
 *   (p. ej. `status`) hace que la operación sea rechazada.
 * - La nueva capacidad no puede ser menor a los cupos actualmente ocupados.
 */
export async function updateClassScheduleAction(
  classId: string,
  input: UpdateClassScheduleInput
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'coach' && session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!classId) {
    return { success: false, error: 'ID de clase no proporcionado.' };
  }

  if (!input || typeof input !== 'object') {
    return { success: false, error: 'Datos de edición no proporcionados.' };
  }

  // Allow-list estricta: solo claseDate y capacity son mutables.
  // Bloquea explícitamente cualquier intento de mutar `status` (cancelación).
  const allowedKeys = ['classDate', 'capacity'];
  const providedKeys = Object.keys(input);
  if (providedKeys.some((key) => !allowedKeys.includes(key))) {
    return {
      success: false,
      error: 'Este flujo solo permite editar la fecha/hora y la capacidad de la clase.',
    };
  }
  if (providedKeys.length === 0) {
    return { success: false, error: 'No se proporcionaron cambios.' };
  }

  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, classId),
  });

  if (!openClass) {
    return { success: false, error: 'Clase no encontrada.' };
  }

  // Ownership (403): admin edita cualquiera; coach solo sus clases.
  if (session.role !== 'admin' && openClass.coachUserId !== session.sub) {
    return { success: false, error: 'No tienes permisos para esta clase.' };
  }

  if (openClass.status !== 'scheduled') {
    return { success: false, error: 'Solo se pueden editar clases programadas.' };
  }

  const update: { classDate?: Date; capacity?: number } = {};

  if (input.classDate !== undefined && input.classDate !== null && input.classDate !== '') {
    const classDate = String(input.classDate);
    const hasTimezone =
      classDate.includes('Z') ||
      classDate.includes('+') ||
      /T\d{2}:\d{2}.*[-+]\d/.test(classDate);
    const date = hasTimezone ? new Date(classDate) : parseDateTimeLocalAsMexicoCity(classDate);

    if (isNaN(date.getTime())) {
      return { success: false, error: 'Fecha y hora no válidas.', field: 'classDate' };
    }
    if (date <= new Date()) {
      return { success: false, error: 'La fecha debe ser en el futuro.', field: 'classDate' };
    }

    update.classDate = date;
  }

  if (input.capacity !== undefined && input.capacity !== null && String(input.capacity) !== '') {
    const capacity = parseInt(String(input.capacity), 10);
    if (isNaN(capacity) || capacity < 1 || capacity > 20) {
      return { success: false, error: 'La capacidad debe ser entre 1 y 20.', field: 'capacity' };
    }

    const occupied = await getTotalOccupied(classId);
    if (capacity < occupied) {
      return {
        success: false,
        error: `La capacidad no puede ser menor a los ${occupied} cupos ocupados actuales.`,
        field: 'capacity',
      };
    }

    update.capacity = capacity;
  }

  if (Object.keys(update).length === 0) {
    return { success: false, error: 'No se proporcionaron cambios válidos.' };
  }

  await db.update(openClasses).set(update).where(eq(openClasses.id, classId));

  revalidatePath('/coach/classes');
  revalidatePath('/admin/classes');
  revalidatePath('/');
  return { success: true, message: 'Clase actualizada exitosamente.' };
}

export async function createClassAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'coach' && session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const classDate = formData.get('classDate') as string;
  const capacityStr = formData.get('capacity') as string;
  const classType = formData.get('classType') as string;

  // Interpret datetime-local as America/Mexico_City, or use directly if already has timezone
  const hasTimezone = classDate && (classDate.includes('Z') || classDate.includes('+') || /T\d{2}:\d{2}.*[-+]\d/.test(classDate));
  const date = hasTimezone ? new Date(classDate) : parseDateTimeLocalAsMexicoCity(classDate);
  if (!classDate || !date || isNaN(date.getTime()) || date <= new Date()) {
    return {
      success: false,
      error: 'La fecha debe ser en el futuro.',
      field: 'classDate',
    };
  }

  // Validate capacity 1-20
  const capacity = parseInt(capacityStr, 10);
  if (isNaN(capacity) || capacity < 1 || capacity > 20) {
    return {
      success: false,
      error: 'La capacidad debe ser entre 1 y 20.',
      field: 'capacity',
    };
  }

  // Validate class type
  if (!classType || !['yoga', 'mat_pilates', 'barre'].includes(classType)) {
    return {
      success: false,
      error: 'Tipo de clase no válido.',
      field: 'classType',
    };
  }

  // Create the class
  await db.insert(openClasses).values({
    classDate: date,
    coachUserId: session.sub,
    capacity,
    classType: classType as 'yoga' | 'mat_pilates' | 'barre',
    status: 'scheduled',
    available: 'available',
  });

  revalidatePath('/coach/classes');
  revalidatePath('/');
  return { success: true, message: '¡Clase creada exitosamente!' };
}
