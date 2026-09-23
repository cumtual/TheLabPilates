import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { CHECKIN_ERROR_MESSAGES, INVALID_QR_MESSAGE } from '@/lib/checkin/errors';
import { isValidCheckinToken } from '@/lib/checkin/token';
import { CheckInProcessor } from '@/components/coach/CheckInProcessor';
import { CheckInResultCard, checkInLinkClassName } from '@/components/coach/CheckInResultCard';

export const metadata: Metadata = {
  title: 'Registro de asistencia',
  robots: { index: false, follow: false },
};

interface CheckInPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/**
 * GET /check-in?token=… — destino del QR (SPEC-QR-CHECKIN §7.1).
 * Fuera de (portal): el middleware no la cubre y la autorización se hace aquí.
 * La mutación la hace <CheckInProcessor> con POST /api/check-in.
 */
export default async function CheckInPage({ searchParams }: CheckInPageProps) {
  const { token } = await searchParams;
  const session = await getSession();

  if (!session) {
    const target = `/check-in?token=${typeof token === 'string' ? token : ''}`;
    redirect(`/login?redirect=${encodeURIComponent(target)}`);
  }

  let content: React.ReactNode;
  if (session.role !== 'coach' && session.role !== 'admin') {
    // D1: forbidden() requiere `experimental.authInterrupts` en Next 16; se usa una
    // vista 403 inline. La API (POST /api/check-in) sí responde HTTP 403.
    content = (
      <CheckInResultCard tone="error" title="403 · Acceso denegado" message={CHECKIN_ERROR_MESSAGES.FORBIDDEN_ROLE}>
        <Link href="/client" className={checkInLinkClassName}>
          Ir a mi panel
        </Link>
      </CheckInResultCard>
    );
  } else if (!isValidCheckinToken(token)) {
    content = (
      <CheckInResultCard tone="error" title="Check-in" message={INVALID_QR_MESSAGE}>
        <Link href={session.role === 'admin' ? '/admin' : '/coach'} className={checkInLinkClassName}>
          Ir a mi panel
        </Link>
      </CheckInResultCard>
    );
  } else {
    content = (
      <CheckInProcessor token={token} dashboardHref={session.role === 'admin' ? '/admin' : '/coach'} />
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10 bg-surface">{content}</main>
  );
}
