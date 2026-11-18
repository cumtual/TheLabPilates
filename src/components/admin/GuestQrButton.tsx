'use client';

import { useState, useTransition } from 'react';
import { getGuestCheckinQrAction } from '@/modules/guest-checkin/presentation/actions/get-guest-qr';
import type { GuestQrView } from '@/modules/guest-checkin/presentation/types';
import { formatFullDateTime } from '@/lib/utils/date';
import { GuestQrModal } from './GuestQrModal';

interface GuestQrButtonProps {
  guestEnrollmentId: string;
  guestName: string;
  /** Se llama al cerrar el modal: el invitado pudo haber hecho check-in mientras tanto. */
  onClose?: () => void;
}

/** Botón "Ver QR" de un invitado agregado por el admin (lectura, sin confirmación). */
export function GuestQrButton({ guestEnrollmentId, guestName, onClose }: GuestQrButtonProps) {
  const [qr, setQr] = useState<GuestQrView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const result = await getGuestCheckinQrAction(guestEnrollmentId);
      if (result.success) setQr(result.data);
      else setError(result.error);
    });
  }

  function close() {
    setQr(null);
    onClose?.();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={open}
        disabled={isPending}
        aria-haspopup="dialog"
        aria-label={`Ver código QR de ${guestName}`}
        className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 rounded-DEFAULT border border-outline/40 font-body text-sm font-semibold text-on-surface disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
          qr_code_2
        </span>
        {isPending ? 'Cargando…' : 'Ver QR'}
      </button>
      {error && (
        <p role="alert" className="font-body text-xs text-error">
          {error}
        </p>
      )}
      {qr && (
        <GuestQrModal
          isOpen
          onClose={close}
          qr={qr}
          classDateLabel={qr.classDate ? formatFullDateTime(qr.classDate) : 'Sin fecha'}
        />
      )}
    </div>
  );
}
