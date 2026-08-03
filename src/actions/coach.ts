'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { openClasses, classEnrollments } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/types';

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

  if (openClass.coachUserId !== session.sub) {
    return { success: false, error: 'No tienes permisos para esta clase.' };
  }

  // Validate class date is in the past (Req 8.4, 8.5)
  if (!openClass.classDate || new Date(openClass.classDate) > new Date()) {
    return { success: false, error: 'No puedes registrar asistencia de una clase futura.' };
  }

  // Update each enrollment status
  for (const record of records) {
    await db
      .update(classEnrollments)
      .set({ status: record.status })
      .where(eq(classEnrollments.id, record.enrollmentId));
  }

  // Mark class as completed
  await db
    .update(openClasses)
    .set({ status: 'completed' })
    .where(eq(openClasses.id, classId));

  return { success: true, message: 'Asistencia registrada exitosamente.' };
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

  // Validate date is in the future
  const date = new Date(classDate);
  if (!classDate || isNaN(date.getTime()) || date <= new Date()) {
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

  return { success: true, message: '¡Clase creada exitosamente!' };
}
