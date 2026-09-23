import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/db';
import { classEnrollments, openClasses } from '@/db/schema';
import { ATTENDANCE_AUTO_CLOSE_FROM } from '@/lib/checkin/constants';
import { getMexicoCityDayBounds } from '@/lib/utils/date';

/**
 * Cierre automático de inasistencias (SPEC-QR-CHECKIN §9).
 *
 * Al terminar el día CDMX de una clase (23:59:59), las reservas que siguen en
 * `pending` pasan a `absent` y su token QR se anula. Corre en el cron diario
 * de las 00:00 CDMX. Recupera días perdidos porque compara contra el inicio del
 * día actual y no contra "ayer".
 */

/** 00:00:00 CDMX del día de `now`: toda clase anterior ya terminó su día. */
export function getAutoCloseCutoff(now: Date): Date {
  return getMexicoCityDayBounds(now).start;
}

export function buildAutoCloseWhere(now: Date) {
  return and(
    eq(classEnrollments.openClassId, openClasses.id),
    eq(classEnrollments.status, 'pending'),
    // Nunca clases canceladas: sus reservas siguen el flujo de cancelación.
    inArray(openClasses.status, ['scheduled', 'completed']),
    // D4: no reescribe el historial anterior a la salida a producción.
    gte(openClasses.classDate, ATTENDANCE_AUTO_CLOSE_FROM),
    lt(openClasses.classDate, getAutoCloseCutoff(now))
  );
}

/** Una sola sentencia UPDATE … FROM: atómica e idempotente. */
export async function markUnattendedEnrollmentsAbsent(now: Date = new Date()): Promise<number> {
  const closed = await db
    .update(classEnrollments)
    .set({ status: 'absent', checkinToken: null })
    .from(openClasses)
    .where(buildAutoCloseWhere(now))
    .returning({ id: classEnrollments.id });

  return closed.length;
}
