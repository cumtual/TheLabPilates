'use server';

import { eq, and, sql, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  users,
  payments,
  specialEvents,
  specialEventDiscounts,
  specialEventRegistrations,
  openClasses,
} from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import {
  sendSpecialEventCancellationEmail,
  sendPaymentRejectedEmail,
} from '@/lib/email/service';
import { getEventClassAvailable } from '@/lib/events/capacity';
import { parseDateTimeLocalAsMexicoCity, formatFullDateTime } from '@/lib/utils/date';
import type { ActionResult } from '@/lib/types';

function parseMexicoCityDate(value: string | null): Date | null {
  if (!value) return null;
  const hasTimezone =
    value.includes('Z') || value.includes('+') || /T\d{2}:\d{2}.*[-+]\d/.test(value);
  const date = hasTimezone ? new Date(value) : parseDateTimeLocalAsMexicoCity(value);
  if (isNaN(date.getTime())) return null;
  return date;
}

function revalidateEventPaths(eventId?: string) {
  revalidatePath('/');
  revalidatePath('/admin/events');
  revalidatePath('/client/events');
  if (eventId) {
    revalidatePath(`/admin/events/${eventId}`);
  }
}

/**
 * Admin: crea un evento especial junto con su matriz de descuentos por membresía.
 * Regla: solo puede existir 1 evento con status 'active' a la vez.
 */
export async function createSpecialEventAction(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const title = (formData.get('title') as string | null)?.trim() ?? '';
  if (title.length < 1 || title.length > 120) {
    return { success: false, error: 'El título es obligatorio (máx. 120 caracteres).', field: 'title' };
  }

  const description = (formData.get('description') as string | null)?.trim() ?? '';
  if (description.length < 1) {
    return { success: false, error: 'La descripción es obligatoria.', field: 'description' };
  }

  const shortDescription = (formData.get('shortDescription') as string | null)?.trim() ?? '';
  if (shortDescription.length < 1 || shortDescription.length > 150) {
    return {
      success: false,
      error: 'La descripción breve es obligatoria (máx. 150 caracteres).',
      field: 'shortDescription',
    };
  }

  const price = parseInt((formData.get('price') as string) ?? '', 10);
  if (isNaN(price) || price <= 0) {
    return { success: false, error: 'El precio debe ser mayor a 0.', field: 'price' };
  }

  const startDate = parseMexicoCityDate(formData.get('startDate') as string | null);
  const endDate = parseMexicoCityDate(formData.get('endDate') as string | null);
  if (!startDate) {
    return { success: false, error: 'La fecha de inicio no es válida.', field: 'startDate' };
  }
  if (!endDate) {
    return { success: false, error: 'La fecha de fin no es válida.', field: 'endDate' };
  }
  if (startDate >= endDate) {
    return { success: false, error: 'La fecha de fin debe ser posterior a la de inicio.', field: 'endDate' };
  }

  const showOnLanding = formData.get('showOnLanding') === 'on' || formData.get('showOnLanding') === 'true';

  // Only one active event at a time.
  const existingActive = await db.query.specialEvents.findFirst({
    where: eq(specialEvents.status, 'active'),
  });
  if (existingActive) {
    return {
      success: false,
      error: 'Ya existe un evento activo. Finalízalo o cancélalo antes de crear otro.',
    };
  }

  // Build discount matrix from `discount_<subscriptionId>` inputs.
  const allSubscriptions = await db.query.subscriptions.findMany();
  const discounts: { subscriptionId: string; discountAmount: number }[] = [];
  for (const sub of allSubscriptions) {
    const raw = formData.get(`discount_${sub.id}`) as string | null;
    if (raw == null || raw.trim() === '') continue;
    const amount = parseInt(raw, 10);
    if (isNaN(amount) || amount < 0) {
      return {
        success: false,
        error: 'Los descuentos deben ser montos válidos (0 o más).',
        field: 'discounts',
      };
    }
    if (amount > price) {
      return {
        success: false,
        error: `El descuento para "${sub.name ?? 'membresía'}" no puede superar el precio.`,
        field: 'discounts',
      };
    }
    if (amount > 0) {
      discounts.push({ subscriptionId: sub.id, discountAmount: amount });
    }
  }

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(specialEvents)
        .values({
          title,
          description,
          shortDescription,
          price,
          startDate,
          endDate,
          status: 'active',
          showOnLanding,
          createdById: session.sub,
        })
        .returning();

      if (discounts.length > 0) {
        await tx.insert(specialEventDiscounts).values(
          discounts.map((d) => ({
            specialEventId: event.id,
            subscriptionId: d.subscriptionId,
            discountAmount: d.discountAmount,
          }))
        );
      }
    });
  } catch {
    return { success: false, error: 'Error al crear el evento. Intenta de nuevo.' };
  }

  revalidateEventPaths();
  return { success: true, message: '¡Evento especial creado exitosamente!' };
}

/**
 * Admin: agrega una clase ligada al evento. Reutiliza las validaciones de
 * `adminCreateClassAction`, marcando `specialEventId` para aislarla del catálogo.
 */
export async function addEventClassAction(
  eventId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!eventId) {
    return { success: false, error: 'ID de evento no proporcionado.' };
  }

  const event = await db.query.specialEvents.findFirst({
    where: eq(specialEvents.id, eventId),
  });
  if (!event) {
    return { success: false, error: 'Evento no encontrado.' };
  }
  if (event.status !== 'active') {
    return { success: false, error: 'Solo puedes agregar clases a un evento activo.' };
  }

  const classDate = formData.get('classDate') as string;
  const capacityStr = formData.get('capacity') as string;
  const classType = formData.get('classType') as string;
  const coachId = formData.get('coachId') as string;

  const date = parseMexicoCityDate(classDate);
  if (!classDate || !date || date <= new Date()) {
    return { success: false, error: 'La fecha debe ser en el futuro.', field: 'classDate' };
  }

  // The class must fall inside the event's date/time range (day/hour/minute).
  if (event.startDate && date < event.startDate) {
    return {
      success: false,
      error: `La clase no puede ser antes del inicio del evento (${formatFullDateTime(event.startDate)}).`,
      field: 'classDate',
    };
  }
  if (event.endDate && date > event.endDate) {
    return {
      success: false,
      error: `La clase no puede ser después del fin del evento (${formatFullDateTime(event.endDate)}).`,
      field: 'classDate',
    };
  }

  const capacity = parseInt(capacityStr, 10);
  if (isNaN(capacity) || capacity < 1 || capacity > 20) {
    return { success: false, error: 'La capacidad debe ser entre 1 y 20.', field: 'capacity' };
  }

  const validClassTypes = ['yoga', 'mat_pilates', 'barre', 'personalizada'];
  if (!classType || !validClassTypes.includes(classType)) {
    return { success: false, error: 'Tipo de clase no válido.', field: 'classType' };
  }

  const customName = formData.get('customName') as string | null;
  let storedCustomName: string | null = null;
  if (classType === 'personalizada') {
    const trimmedName = customName?.trim() ?? '';
    if (trimmedName.length === 0) {
      return { success: false, error: 'El nombre de la clase personalizada es obligatorio.', field: 'customName' };
    }
    if (trimmedName.length > 100) {
      return { success: false, error: 'El nombre no puede exceder 100 caracteres.', field: 'customName' };
    }
    storedCustomName = trimmedName;
  }

  if (!coachId) {
    return { success: false, error: 'Debes seleccionar un coach.', field: 'coachId' };
  }

  const coach = await db.query.users.findFirst({
    where: eq(users.id, coachId),
  });
  if (!coach || coach.deletedAt || (coach.role !== 'coach' && coach.role !== 'admin')) {
    return { success: false, error: 'Coach no válido.', field: 'coachId' };
  }

  try {
    await db.insert(openClasses).values({
      classDate: date,
      coachUserId: coachId,
      capacity,
      classType: classType as 'yoga' | 'mat_pilates' | 'barre' | 'personalizada',
      customName: storedCustomName,
      status: 'scheduled',
      available: 'available',
      specialEventId: eventId,
    });
  } catch {
    return { success: false, error: 'Error al crear la clase. Intenta de nuevo.' };
  }

  revalidateEventPaths(eventId);
  return { success: true, message: '¡Clase agregada al evento exitosamente!' };
}

/**
 * Admin: muestra/oculta el evento activo en la landing page.
 */
export async function toggleEventLandingAction(
  eventId: string,
  show: boolean
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const event = await db.query.specialEvents.findFirst({
    where: eq(specialEvents.id, eventId),
  });
  if (!event) {
    return { success: false, error: 'Evento no encontrado.' };
  }

  await db
    .update(specialEvents)
    .set({ showOnLanding: show })
    .where(eq(specialEvents.id, eventId));

  revalidateEventPaths(eventId);
  return {
    success: true,
    message: show ? 'Evento visible en la landing.' : 'Evento retirado de la landing.',
  };
}

/**
 * Admin: finaliza el evento (status 'completed'). Deja de mostrarse en la landing.
 */
export async function completeSpecialEventAction(eventId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const event = await db.query.specialEvents.findFirst({
    where: eq(specialEvents.id, eventId),
  });
  if (!event) {
    return { success: false, error: 'Evento no encontrado.' };
  }
  if (event.status === 'completed') {
    return { success: false, error: 'Este evento ya fue finalizado.' };
  }

  await db
    .update(specialEvents)
    .set({ status: 'completed' })
    .where(eq(specialEvents.id, eventId));

  revalidateEventPaths(eventId);
  return { success: true, message: 'Evento finalizado y retirado de la landing.' };
}

/**
 * Admin: cancela el evento completo.
 * - Evento y todas sus clases pasan a 'cancelled'.
 * - Registros 'confirmed' → 'refund_pending' (reembolso manual).
 * - Notifica por email a los inscritos.
 */
export async function cancelSpecialEventAction(eventId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const event = await db.query.specialEvents.findFirst({
    where: eq(specialEvents.id, eventId),
  });
  if (!event) {
    return { success: false, error: 'Evento no encontrado.' };
  }
  if (event.status === 'cancelled') {
    return { success: false, error: 'Este evento ya está cancelado.' };
  }

  const affectedRegistrations = await db
    .select({
      email: users.email,
      name: users.username,
      status: specialEventRegistrations.status,
    })
    .from(specialEventRegistrations)
    .innerJoin(users, eq(specialEventRegistrations.userId, users.id))
    .where(
      and(
        eq(specialEventRegistrations.specialEventId, eventId),
        inArray(specialEventRegistrations.status, ['pending', 'confirmed'])
      )
    );

  await db.transaction(async (tx) => {
    await tx
      .update(specialEvents)
      .set({ status: 'cancelled' })
      .where(eq(specialEvents.id, eventId));

    await tx
      .update(openClasses)
      .set({ status: 'cancelled' })
      .where(eq(openClasses.specialEventId, eventId));

    await tx
      .update(specialEventRegistrations)
      .set({ status: 'refund_pending' })
      .where(
        and(
          eq(specialEventRegistrations.specialEventId, eventId),
          eq(specialEventRegistrations.status, 'confirmed')
        )
      );
  });

  if (affectedRegistrations.length > 0) {
    sendSpecialEventCancellationEmail(
      affectedRegistrations.map((r) => ({ email: r.email, name: r.name })),
      { title: event.title, startDate: event.startDate ?? new Date() }
    ).catch(() => {
      // Email failures are logged internally by the email service
    });
  }

  revalidateEventPaths(eventId);
  return {
    success: true,
    message: 'Evento cancelado. Los inscritos fueron notificados y sus reembolsos quedan pendientes.',
  };
}

/**
 * Admin: confirma el pago de una inscripción a evento.
 * Bajo lock de la fila de la clase, verifica disponibilidad y recién entonces
 * descuenta el cupo (status 'confirmed'). Si la clase está llena → rollback.
 */
export async function confirmEventPaymentAction(registrationId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!registrationId) {
    return { success: false, error: 'ID de inscripción no proporcionado.' };
  }

  const registration = await db.query.specialEventRegistrations.findFirst({
    where: eq(specialEventRegistrations.id, registrationId),
  });
  if (!registration) {
    return { success: false, error: 'Inscripción no encontrada.' };
  }
  if (registration.status !== 'pending') {
    return { success: false, error: 'Esta inscripción ya fue procesada.' };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM open_class WHERE id = ${registration.openClassId} FOR UPDATE`
      );

      const available = await getEventClassAvailable(registration.openClassId, tx);
      if (available < 1) {
        throw new Error('NO_CAPACITY');
      }

      await tx
        .update(payments)
        .set({ confirmed: true, dateConfirmed: new Date() })
        .where(eq(payments.id, registration.paymentId));

      await tx
        .update(specialEventRegistrations)
        .set({ status: 'confirmed' })
        .where(eq(specialEventRegistrations.id, registrationId));
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NO_CAPACITY') {
      return {
        success: false,
        error: 'La clase seleccionada está llena. Rechaza el pago o cambia al usuario de clase.',
      };
    }
    return { success: false, error: 'No se pudo confirmar el pago. Intenta de nuevo.' };
  }

  revalidateEventPaths(registration.specialEventId);
  return { success: true, message: 'Pago confirmado. La reserva del lugar quedó garantizada.' };
}

/**
 * Admin: rechaza el pago de una inscripción a evento.
 * Elimina la inscripción y el pago para permitir que el usuario reintente.
 */
export async function rejectEventPaymentAction(registrationId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!registrationId) {
    return { success: false, error: 'ID de inscripción no proporcionado.' };
  }

  const registration = await db.query.specialEventRegistrations.findFirst({
    where: eq(specialEventRegistrations.id, registrationId),
  });
  if (!registration) {
    return { success: false, error: 'Inscripción no encontrada.' };
  }
  if (registration.status === 'confirmed') {
    return {
      success: false,
      error: 'No se puede rechazar un pago ya confirmado. Cancela el evento si necesitas reembolsar.',
    };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, registration.userId),
  });

  await db.transaction(async (tx) => {
    await tx
      .delete(specialEventRegistrations)
      .where(eq(specialEventRegistrations.id, registrationId));
    await tx.delete(payments).where(eq(payments.id, registration.paymentId));
  });

  if (user) {
    sendPaymentRejectedEmail(user.email, user.username).catch(() => {
      // Email failures are logged internally
    });
  }

  revalidateEventPaths(registration.specialEventId);
  return { success: true, message: 'Pago rechazado y eliminado. El cliente ha sido notificado.' };
}

/**
 * Admin: marca como reembolsado un registro cuyo evento fue cancelado.
 */
export async function markRefundedAction(registrationId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const registration = await db.query.specialEventRegistrations.findFirst({
    where: eq(specialEventRegistrations.id, registrationId),
  });
  if (!registration) {
    return { success: false, error: 'Inscripción no encontrada.' };
  }
  if (registration.status !== 'refund_pending') {
    return { success: false, error: 'Esta inscripción no tiene un reembolso pendiente.' };
  }

  await db
    .update(specialEventRegistrations)
    .set({ status: 'refunded' })
    .where(eq(specialEventRegistrations.id, registrationId));

  revalidateEventPaths(registration.specialEventId);
  return { success: true, message: 'Reembolso marcado como completado.' };
}

// (Helpers de lectura para el panel admin viven en las páginas server.)
