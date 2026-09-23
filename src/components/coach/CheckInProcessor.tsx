'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getCheckinErrorMessage,
  isCheckinErrorCode,
  type CheckinErrorCode,
  type CheckinErrorDetails,
} from '@/lib/checkin/errors';
import { formatFullDateTime } from '@/lib/utils/date';
import { CheckInResultCard, checkInLinkClassName } from './CheckInResultCard';

interface CheckInSuccessData {
  studentName: string;
  className?: string;
  classDate?: string | null;
}

type CheckInState =
  | { kind: 'loading' }
  | { kind: 'success'; data: CheckInSuccessData }
  | { kind: 'error'; code: CheckinErrorCode; details?: CheckinErrorDetails }
  | { kind: 'network' };

interface CheckInProcessorProps {
  token: string;
  /** Panel del rol actual (/coach o /admin). */
  dashboardHref: string;
}

/**
 * Registra la asistencia del QR escaneado con un único POST (SPEC-QR-CHECKIN §10.2).
 * La mutación va por POST y no en el render de la página: un GET (prefetch,
 * vista previa o recarga) nunca registra asistencia.
 */
export function CheckInProcessor({ token, dashboardHref }: CheckInProcessorProps) {
  const [state, setState] = useState<CheckInState>({ kind: 'loading' });
  // Evita el doble envío del doble efecto de StrictMode (los refs se conservan).
  const startedRef = useRef(false);

  const submit = useCallback(async () => {
    try {
      const response = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok) {
        setState({ kind: 'success', data: body.data });
        return;
      }
      const code = body?.error?.code;
      setState({
        kind: 'error',
        code: isCheckinErrorCode(code) ? code : 'INTERNAL_ERROR',
        details: body?.error?.details,
      });
    } catch {
      setState({ kind: 'network' });
    }
  }, [token]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void submit();
  }, [submit]);

  const retry = () => {
    setState({ kind: 'loading' });
    void submit();
  };

  const dashboardLink = (
    <Link href={dashboardHref} className={checkInLinkClassName}>
      Ir a mi panel
    </Link>
  );

  if (state.kind === 'loading') {
    return <CheckInResultCard tone="loading" title="Registrando asistencia…" />;
  }

  if (state.kind === 'success') {
    const { studentName, className, classDate } = state.data;
    const detail = [className, classDate ? formatFullDateTime(classDate, false) : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <CheckInResultCard
        tone="success"
        title="Check-in"
        message={`¡Asistencia confirmada! Bienvenido(a) ${studentName}`}
        detail={detail || undefined}
      >
        {dashboardLink}
      </CheckInResultCard>
    );
  }

  if (state.kind === 'network') {
    return (
      <CheckInResultCard
        tone="error"
        title="Sin conexión"
        message="No pudimos contactar al servidor. Revisa tu conexión."
      >
        <button type="button" onClick={retry} className={checkInLinkClassName}>
          Reintentar
        </button>
      </CheckInResultCard>
    );
  }

  const loginHref = `/login?redirect=${encodeURIComponent(`/check-in?token=${token}`)}`;
  return (
    <CheckInResultCard
      tone="error"
      title="No se registró la asistencia"
      message={getCheckinErrorMessage(state.code, state.details)}
    >
      {state.code === 'UNAUTHENTICATED' ? (
        <Link href={loginHref} className={checkInLinkClassName}>
          Iniciar sesión
        </Link>
      ) : (
        dashboardLink
      )}
    </CheckInResultCard>
  );
}
