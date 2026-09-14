import { eq, and, notInArray, count } from 'drizzle-orm';
import { db } from '@/db';
import { openClasses, classEnrollments, guestEnrollments } from '@/db/schema';

/**
 * Conexión de base de datos o transacción. Permite reutilizar estos helpers
 * dentro de un `db.transaction()` para que lean el estado no confirmado y
 * respeten el lock de la fila (SELECT ... FOR UPDATE).
 */
type DbOrTx = Pick<typeof db, 'select' | 'query'>;

/**
 * Calcula el total de cupos ocupados en una clase.
 * Suma las inscripciones activas de titulares (class_enrolleds) y de invitados (guest_enrollments),
 * excluyendo las que tienen status 'cancelled' o 'late_cancelled'.
 */
export async function getTotalOccupied(classId: string, conn: DbOrTx = db): Promise<number> {
  const excludedStatuses: ('cancelled' | 'late_cancelled')[] = ['cancelled', 'late_cancelled'];

  const [enrolledCount] = await conn
    .select({ count: count() })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.openClassId, classId),
        notInArray(classEnrollments.status, excludedStatuses)
      )
    );

  const [guestCount] = await conn
    .select({ count: count() })
    .from(guestEnrollments)
    .where(
      and(
        eq(guestEnrollments.openClassId, classId),
        notInArray(guestEnrollments.status, excludedStatuses)
      )
    );

  return (enrolledCount?.count ?? 0) + (guestCount?.count ?? 0);
}

/**
 * Calcula la capacidad disponible de una clase.
 * Fórmula: capacity - enrollments_activos - guest_enrollments_activos
 * (excluyendo status 'cancelled' y 'late_cancelled')
 *
 * Retorna 0 si la clase no existe o no tiene capacidad definida.
 */
export async function getAvailableCapacity(classId: string, conn: DbOrTx = db): Promise<number> {
  const openClass = await conn.query.openClasses.findFirst({
    where: eq(openClasses.id, classId),
  });

  if (!openClass || openClass.capacity == null) {
    return 0;
  }

  const totalOccupied = await getTotalOccupied(classId, conn);

  return Math.max(0, openClass.capacity - totalOccupied);
}
