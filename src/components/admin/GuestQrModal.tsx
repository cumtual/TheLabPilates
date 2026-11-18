'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Modal } from '@/components/ui/Modal';
import type { GuestQrView } from '@/modules/guest-checkin/presentation/types';

interface GuestQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  qr: GuestQrView;
  classDateLabel: string;
}

/** Nombre de archivo seguro para descargar el QR: `qr-invitado-maria-lopez.svg`. */
export function guestQrFileName(guestName: string): string {
  const slug = guestName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `qr-invitado-${slug || 'invitado'}.svg`;
}

/**
 * QR de check-in de un invitado agregado por el admin (SPEC-GUEST-QR-CHECKIN §5.4).
 * Se puede abrir las veces que haga falta mientras el invitado siga pendiente (D2).
 */
export function GuestQrModal({ isOpen, onClose, qr, classDateLabel }: GuestQrModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Foco inicial en "Cerrar" (el Modal compartido no lo gestiona).
  useEffect(() => {
    if (!isOpen) return;
    contentRef.current
      ?.closest('[role="dialog"]')
      ?.querySelector<HTMLButtonElement>('button')
      ?.focus();
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onClose}
      title={`QR de ${qr.guestName}`}
      confirmLabel="Cerrar"
      hideCancel
    >
      <div ref={contentRef} className="flex flex-col items-center gap-4 text-center">
        <div className="w-full max-w-[280px] aspect-square rounded-lg bg-white p-3">
          <Image
            src={qr.qrDataUrl}
            alt={`Código QR de asistencia de ${qr.guestName} para ${qr.className} del ${classDateLabel}`}
            width={256}
            height={256}
            unoptimized
            className="w-full h-full"
          />
        </div>
        <p className="font-body text-sm text-on-surface-variant">
          El coach de la clase lo escanea para registrar la asistencia. Sirve una sola vez.
        </p>
        <p className="font-body text-sm font-semibold text-on-surface capitalize">
          {qr.className} · {classDateLabel}
        </p>
        <a
          href={qr.qrDataUrl}
          download={guestQrFileName(qr.guestName)}
          className="inline-flex items-center justify-center gap-2 min-h-11 w-full px-6 py-3 rounded-DEFAULT border border-outline/40 font-body font-semibold text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
            download
          </span>
          Descargar QR
        </a>
      </div>
    </Modal>
  );
}
