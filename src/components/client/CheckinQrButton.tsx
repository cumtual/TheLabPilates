'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CHECKIN_CONFIRMATION_DISPLAY_MS,
  CHECKIN_STATUS_POLL_MAX_MS,
  CHECKIN_STATUS_POLL_MS,
} from '@/lib/checkin/constants';
import { CheckinQrModal } from './CheckinQrModal';

type PollResult = 'pending' | 'done' | 'stop';

interface CheckinQrButtonProps {
  enrollmentId: string;
  qrDataUrl: string;
  className: string;
  classDateLabel: string;
}

/**
 * Botón "Ver mi código QR" de la tarjeta "Tu próxima clase" (SPEC-QR-CHECKIN §10.1).
 * Con el modal abierto consulta el estado de la reserva; en cuanto el coach
 * registra la asistencia, cierra el modal y refresca el dashboard.
 */
export function CheckinQrButton({ enrollmentId, qrDataUrl, className, classDateLabel }: CheckinQrButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const checkStatus = useCallback(async (): Promise<PollResult> => {
    try {
      const response = await fetch(
        `/api/check-in/status?enrollmentId=${encodeURIComponent(enrollmentId)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) return 'stop';
      const body = await response.json();
      return body?.data?.status === 'pending' ? 'pending' : 'done';
    } catch {
      return 'pending'; // error de red transitorio: se reintenta en el siguiente ciclo
    }
  }, [enrollmentId]);

  // Polling solo con el modal abierto, la pestaña visible y hasta un máximo de tiempo.
  useEffect(() => {
    if (!open || confirmed) return;
    let cancelled = false;
    const startedAt = Date.now();

    const intervalId = window.setInterval(async () => {
      if (Date.now() - startedAt >= CHECKIN_STATUS_POLL_MAX_MS) {
        window.clearInterval(intervalId);
        return;
      }
      if (document.visibilityState !== 'visible') return;

      const result = await checkStatus();
      if (cancelled) return;
      if (result === 'done') {
        window.clearInterval(intervalId);
        setConfirmed(true);
      } else if (result === 'stop') {
        window.clearInterval(intervalId);
      }
    }, CHECKIN_STATUS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [open, confirmed, checkStatus]);

  // Tras mostrar la confirmación: cerrar y refrescar (el QR desaparece del dashboard).
  useEffect(() => {
    if (!confirmed) return;
    const timeoutId = window.setTimeout(() => {
      setOpen(false);
      router.refresh();
    }, CHECKIN_CONFIRMATION_DISPLAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [confirmed, router]);

  const handleClose = () => {
    setOpen(false);
    triggerRef.current?.focus();
    if (confirmed) return;
    // Consulta final: el escaneo pudo ocurrir entre dos ciclos de polling.
    void checkStatus().then((result) => {
      if (result === 'done') router.refresh();
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center justify-center gap-2 min-h-11 w-full sm:w-auto px-5 py-2.5 rounded-DEFAULT bg-primary text-on-primary font-body text-body-md font-semibold transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
          qr_code_2
        </span>
        Ver mi código QR
      </button>

      <CheckinQrModal
        isOpen={open}
        onClose={handleClose}
        qrDataUrl={qrDataUrl}
        className={className}
        classDateLabel={classDateLabel}
        confirmed={confirmed}
      />
    </>
  );
}
