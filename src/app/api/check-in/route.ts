import { getSession } from '@/lib/auth/session';
import { checkinError, checkinJson } from '@/lib/checkin/http';
import { processCheckin } from '@/lib/checkin/process-checkin';

/**
 * POST /api/check-in — registra la asistencia de un QR (SPEC-QR-CHECKIN §7.2).
 * Orden: Origin → sesión → rol → body → transacción.
 */

/** Defensa CSRF adicional a la cookie SameSite=Lax. */
function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    new URL(request.url).host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

async function readToken(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    const token = (body as { token?: unknown } | null)?.token;
    return typeof token === 'string' ? token : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    if (isCrossOrigin(request)) return checkinError('INVALID_ORIGIN');

    const session = await getSession();
    if (!session) return checkinError('UNAUTHENTICATED');
    // El cliente nunca llega a la BD: 403 antes de leer el body.
    if (session.role !== 'coach' && session.role !== 'admin') {
      return checkinError('FORBIDDEN_ROLE');
    }

    const token = await readToken(request);
    if (token === null) return checkinError('INVALID_PAYLOAD');

    const result = await processCheckin({
      token,
      actor: { id: session.sub, role: session.role },
    });
    if (!result.ok) return checkinError(result.code, result.details);

    return checkinJson({ ok: true, data: result.data });
  } catch (error) {
    console.error('Check-in error:', error);
    return checkinError('INTERNAL_ERROR');
  }
}
