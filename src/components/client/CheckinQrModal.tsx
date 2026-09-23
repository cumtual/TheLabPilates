'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Modal } from '@/components/ui/Modal';

interface CheckinQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrDataUrl: string;
  className: string;
  classDateLabel: string;
  confirmed: boolean;
}

/** Modal con el QR de asistencia (patrón visual de BankTransferModal). */
export function CheckinQrModal({
  isOpen,
  onClose,
  qrDataUrl,
  className,
  classDateLabel,
  confirmed,
}: CheckinQrModalProps) {
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
      title="Tu código QR"
      confirmLabel="Cerrar"
      hideCancel
    >
      <div ref={contentRef} className="flex flex-col items-center gap-4 text-center">
        {confirmed ? (
          <p aria-live="polite" className="flex flex-col items-center gap-2 py-8">
            <span aria-hidden="true" className="material-symbols-outlined text-[64px] text-primary">
              check_circle
            </span>
            <span className="font-body text-lg font-semibold text-on-surface">
              ¡Asistencia confirmada!
            </span>
          </p>
        ) : (
          <>
            <div className="w-full max-w-[280px] aspect-square rounded-lg bg-white p-3">
              <Image
                src={qrDataUrl}
                alt={`Código QR de asistencia para ${className} del ${classDateLabel}`}
                width={256}
                height={256}
                unoptimized
                className="w-full h-full"
              />
            </div>
            <p className="font-body text-sm text-on-surface-variant">
              Muestra este código a tu coach al llegar.
            </p>
            <p className="font-body text-sm font-semibold text-on-surface capitalize">
              {className} · {classDateLabel}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
