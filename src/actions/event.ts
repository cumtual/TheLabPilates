'use server';

import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  payments,
  openClasses,
  specialEvents,
  specialEventRegistrations,
} from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { computeEventPrice, getEventClassAvailable } from '@/lib/events/capacity';
import type { ActionResult } from '@/lib/types';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

/**
 * Cliente: adquiere una inscripción a un evento especial.
 *
 * Reglas:
 * - Una sola inscripción por usuario por evento (unique index como red de seguridad).
 * - Debe elegir exactamente 1 clase del evento con lugares disponibles.
 * - Debe aceptar explícitamente el aviso de no devoluciones.
 * - El cupo NO se aparta: la inscripción queda 'pending' hasta que el admin apruebe.
 * - No se permiten invitados ni consumo de créditos de suscripción.
 */
export async function purchaseSpecialEventAction(
  eventId: string,
  classId: string,
  paymentType: 'transfer' | 'cash',
  acceptedNoRefund: boolean
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }
  if (session.role !== 'client') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!acceptedNoRefund) {
    return {
      success: false,
      error: 'Debes aceptar el aviso de que la compra es definitiva y no tiene devolución.',
    };
  }

  if (paymentType !== 'transfer' && paymentType !== 'cash') {
    return { success: false, error: 'Método de pago no válido.' };
  }

  if (!eventId) {
    return { success: false, error: 'Evento no proporcionado.' };
  }
  if (!classId) {
    return { success: false, error: 'Debes seleccionar una clase.' };
  }

  const event = await db.query.specialEvents.findFirst({
    where: eq(specialEvents.id, eventId),
  });
  if (!event || event.status !== 'active') {
    return { success: false, error: 'El evento no está disponible.' };
  }

  // Single-purchase rule (application-level check; unique index is the safety net).
  const existing = await db.query.specialEventRegistrations.findFirst({
    where: and(
      eq(specialEventRegistrations.specialEventId, eventId),
      eq(specialEventRegistrations.userId, session.sub)
    ),
  });
  if (existing) {
    return { success: false, error: 'Ya adquiriste este evento.' };
  }

  const openClass = await db.query.openClasses.findFirst({
    where: eq(openClasses.id, classId),
  });
  if (!openClass || openClass.specialEventId !== eventId) {
    return { success: false, error: 'La clase seleccionada no pertenece a este evento.' };
  }
  if (openClass.status !== 'scheduled') {
    return { success: false, error: 'La clase seleccionada no está disponible.' };
  }

  const available = await getEventClassAvailable(classId);
  if (available < 1) {
    return { success: false, error: 'La clase seleccionada está llena.' };
  }

  const amountPaid = await computeEventPrice(event, session.sub);

  try {
    await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({ paymentType, confirmed: false })
        .returning();

      await tx.insert(specialEventRegistrations).values({
        specialEventId: eventId,
        userId: session.sub,
        openClassId: classId,
        paymentId: payment.id,
        amountPaid,
        status: 'pending',
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: 'Ya adquiriste este evento.' };
    }
    return { success: false, error: 'No se pudo registrar tu compra. Intenta de nuevo.' };
  }

  revalidatePath('/client/events');
  revalidatePath('/client');

  if (paymentType === 'transfer') {
    return {
      success: true,
      message:
        'Inscripción registrada. Realiza la transferencia a la cuenta bancaria indicada y espera la confirmación del administrador para asegurar tu lugar.',
      data: { paymentType: 'transfer' },
    };
  }

  return {
    success: true,
    message:
      'Inscripción registrada. Realiza el pago en efectivo en el estudio y espera la confirmación del administrador para asegurar tu lugar.',
    data: { paymentType: 'cash' },
  };
}
