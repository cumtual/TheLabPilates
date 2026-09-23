import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { classEnrollments, openClasses, userSubscriptions, users } from '@/db/schema';
import { ensureCheckinToken } from '@/lib/checkin/ensure-token';
import { buildCheckinQrDataUrl } from '@/lib/checkin/qr';
import { buildCheckinUrl } from '@/lib/checkin/token';
import { CLASS_DURATION_MS } from '@/lib/utils/date';

export interface NextClassCheckin {
  qrDataUrl: string;
}

/**
 * D3: la clase sigue siendo "próxima" hasta que termina (inicio + 50 min), para
 * que quien llega tarde pueda mostrar su QR.
 */
export function getNextClassCutoff(now: Date): Date {
  return new Date(now.getTime() - CLASS_DURATION_MS);
}

async function resolveCheckin(
  enrollmentId: string,
  currentToken: string | null
): Promise<NextClassCheckin | null> {
  try {
    // Fallback en runtime: reservas sin token (anteriores al backfill o flujos no cubiertos).
    const token = currentToken ?? (await ensureCheckinToken(enrollmentId));
    if (!token) return null;
    return { qrDataUrl: await buildCheckinQrDataUrl(buildCheckinUrl(token)) };
  } catch (error) {
    // Fail-soft: el dashboard se muestra aunque el QR no esté disponible.
    console.error('Check-in QR unavailable:', error);
    return null;
  }
}

/**
 * Próxima reserva `pending` del usuario (o la que está en curso), con su QR de
 * check-in ya generado en el servidor. El token no se expone suelto al cliente.
 */
export async function getNextClassWithCheckin(userId: string, now: Date = new Date()) {
  const [nextClass] = await db
    .select({
      enrollmentId: classEnrollments.id,
      classDate: openClasses.classDate,
      classType: openClasses.classType,
      customName: openClasses.customName,
      coachName: users.username,
      checkinToken: classEnrollments.checkinToken,
    })
    .from(classEnrollments)
    .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
    .innerJoin(openClasses, eq(classEnrollments.openClassId, openClasses.id))
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(classEnrollments.status, 'pending'),
        eq(openClasses.status, 'scheduled'),
        gt(openClasses.classDate, getNextClassCutoff(now))
      )
    )
    .orderBy(openClasses.classDate)
    .limit(1);

  if (!nextClass) return null;

  const { checkinToken, ...details } = nextClass;
  return { ...details, checkin: await resolveCheckin(details.enrollmentId, checkinToken) };
}
