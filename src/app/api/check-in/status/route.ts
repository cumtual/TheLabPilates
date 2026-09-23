import { getSession } from '@/lib/auth/session';
import { checkinError, checkinJson } from '@/lib/checkin/http';
import { getOwnEnrollmentCheckinStatus } from '@/lib/checkin/status';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/check-in/status?enrollmentId=<uuid> — polling del modal QR del
 * cliente (SPEC-QR-CHECKIN §7.3). Solo responde por reservas propias.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return checkinError('UNAUTHENTICATED');

    const enrollmentId = new URL(request.url).searchParams.get('enrollmentId');
    if (!enrollmentId || !UUID_REGEX.test(enrollmentId)) {
      return checkinError('INVALID_PAYLOAD');
    }

    const enrollment = await getOwnEnrollmentCheckinStatus(enrollmentId, session.sub);
    if (!enrollment) return checkinError('ENROLLMENT_NOT_FOUND');

    return checkinJson({
      ok: true,
      data: {
        status: enrollment.status,
        checkedInAt: enrollment.checkedInAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('Check-in status error:', error);
    return checkinError('INTERNAL_ERROR');
  }
}
