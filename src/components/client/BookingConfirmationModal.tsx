'use client';

import { Modal } from '@/components/ui/Modal';
import { formatTimeWithMeridiem } from '@/lib/utils/date';

export interface BookingConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Nombre visible de la clase (p. ej. "Mat Pilates"). */
  classLabel: string;
  /** Fecha/hora de inicio de la clase. */
  classDateTime: Date | string;
  /** Deshabilita la confirmación mientras corre la mutación. */
  isLoading?: boolean;
}

export function BookingConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  classLabel,
  classDateTime,
}: BookingConfirmationModalProps) {
  const time = formatTimeWithMeridiem(classDateTime);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Confirmar reserva"
      confirmLabel="Confirmar Reserva"
      cancelLabel="Cancelar / Volver"
    >
      <div className="space-y-3">
        <p>
          ¿Confirmar tu reserva para{' '}
          <span className="font-semibold text-on-surface">{classLabel}</span> a las{' '}
          <span className="font-semibold text-on-surface">{time}</span>?
        </p>

        <div className="rounded-DEFAULT border border-primary/30 bg-primary/10 p-3 space-y-1">
          <p className="font-body text-sm font-semibold text-on-surface">
            Política de cancelación
          </p>
          <p className="font-body text-xs text-on-surface-variant">
            Recuerda que tienes hasta 24 horas antes de la clase para cancelar y recuperar tu
            crédito. Cuentas con 10 minutos de tolerancia tras reservar por si cometiste un error.
          </p>
        </div>
      </div>
    </Modal>
  );
}
