import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { classEnrollments } from '@/db/schema';
import { generateCheckinToken } from './token';

const UNIQUE_VIOLATION = '23505';

/** postgres.js expone `code`; Drizzle ≥ 0.44 lo envuelve en `cause`. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: { code?: unknown } };
  return code === UNIQUE_VIOLATION || cause?.code === UNIQUE_VIOLATION;
}

/**
 * UPDATE condicional y atómico: solo escribe si la reserva sigue `pending` y sin
 * token, así dos peticiones simultáneas no se pisan.
 */
async function assignNewToken(enrollmentId: string): Promise<string | null> {
  const [updated] = await db
    .update(classEnrollments)
    .set({ checkinToken: generateCheckinToken() })
    .where(
      and(
        eq(classEnrollments.id, enrollmentId),
        eq(classEnrollments.status, 'pending'),
        isNull(classEnrollments.checkinToken)
      )
    )
    .returning({ checkinToken: classEnrollments.checkinToken });

  return updated?.checkinToken ?? null;
}

/**
 * Fallback en runtime (SPEC-QR-CHECKIN §4): garantiza que una reserva `pending`
 * tenga token. Devuelve `null` si la reserva ya no está `pending`.
 * El llamador debe haber verificado que la reserva pertenece al usuario.
 */
export async function ensureCheckinToken(enrollmentId: string): Promise<string | null> {
  let assigned: string | null;
  try {
    assigned = await assignNewToken(enrollmentId);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    assigned = await assignNewToken(enrollmentId);
  }
  if (assigned) return assigned;

  // Otra petición generó el token primero, o la reserva ya no está pending.
  const current = await db.query.classEnrollments.findFirst({
    where: and(eq(classEnrollments.id, enrollmentId), eq(classEnrollments.status, 'pending')),
    columns: { checkinToken: true },
  });
  return current?.checkinToken ?? null;
}
