import { eq, and, notInArray, count, desc } from 'drizzle-orm';
import { db } from '@/db';
import {
  openClasses,
  guestEnrollments,
  specialEventRegistrations,
  specialEventDiscounts,
  userSubscriptions,
  payments,
} from '@/db/schema';

/**
 * Conexión de base de datos o transacción. Permite reutilizar estos helpers
 * dentro de un `db.transaction()` para que lean el estado no confirmado y
 * respeten el lock de la fila (SELECT ... FOR UPDATE).
 */
type DbOrTx = Pick<typeof db, 'select' | 'query'>;

/**
 * Calcula el total de cupos ocupados en una clase de evento especial.
 *
 * A diferencia de las clases normales, la ocupación de un evento se compone de:
 * - Inscripciones CONFIRMADAS a eventos (special_event_registrations.status='confirmed')
 * - Invitados activos (guest_enrollments), típicamente registrados por el admin.
 *
 * Los registros 'pending' NO restan cupo: el lugar solo se garantiza cuando el
 * administrador aprueba el pago (Requisito de reserva de cupo).
 */
export async function getEventClassOccupied(
  openClassId: string,
  conn: DbOrTx = db
): Promise<number> {
  const excludedStatuses: ('cancelled' | 'late_cancelled')[] = [
    'cancelled',
    'late_cancelled',
  ];

  const [confirmedCount] = await conn
    .select({ count: count() })
    .from(specialEventRegistrations)
    .where(
      and(
        eq(specialEventRegistrations.openClassId, openClassId),
        eq(specialEventRegistrations.status, 'confirmed')
      )
    );

  const [guestCount] = await conn
    .select({ count: count() })
    .from(guestEnrollments)
    .where(
      and(
        eq(guestEnrollments.openClassId, openClassId),
        notInArray(guestEnrollments.status, excludedStatuses)
      )
    );

  return (confirmedCount?.count ?? 0) + (guestCount?.count ?? 0);
}

/**
 * Calcula la capacidad disponible de una clase de evento.
 * Fórmula: capacity - registros_confirmados - invitados_activos.
 * Retorna 0 si la clase no existe o no tiene capacidad definida.
 */
export async function getEventClassAvailable(
  openClassId: string,
  conn: DbOrTx = db
): Promise<number> {
  const openClass = await conn.query.openClasses.findFirst({
    where: eq(openClasses.id, openClassId),
  });

  if (!openClass || openClass.capacity == null) {
    return 0;
  }

  const totalOccupied = await getEventClassOccupied(openClassId, conn);

  return Math.max(0, openClass.capacity - totalOccupied);
}

/**
 * Busca la suscripción activa de un usuario y devuelve el descuento (monto fijo MXN)
 * configurado para el evento, si existe. Si no hay suscripción activa o no hay fila
 * de descuento, retorna 0.
 */
export async function getEventDiscountForUser(
  specialEventId: string,
  userId: string,
  conn: DbOrTx = db
): Promise<number> {
  const activeSubs = await conn
    .select({
      subscriptionId: userSubscriptions.subscriptionId,
    })
    .from(userSubscriptions)
    .innerJoin(payments, eq(userSubscriptions.paymentId, payments.id))
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.active, true),
        eq(userSubscriptions.status, 'active'),
        eq(payments.confirmed, true)
      )
    )
    .orderBy(desc(userSubscriptions.createdAt));

  if (activeSubs.length === 0) {
    return 0;
  }

  for (const sub of activeSubs) {
    const discount = await conn.query.specialEventDiscounts.findFirst({
      where: and(
        eq(specialEventDiscounts.specialEventId, specialEventId),
        eq(specialEventDiscounts.subscriptionId, sub.subscriptionId)
      ),
    });
    if (discount && discount.discountAmount > 0) {
      return discount.discountAmount;
    }
  }

  return 0;
}

/**
 * Calcula el precio final de un evento para un usuario:
 * `max(0, eventPrice - descuentoDeSuMembresía)`. Sin membresía aplicable → precio base.
 */
export async function computeEventPrice(
  event: { id: string; price: number },
  userId: string,
  conn: DbOrTx = db
): Promise<number> {
  const discount = await getEventDiscountForUser(event.id, userId, conn);
  return Math.max(0, event.price - discount);
}
