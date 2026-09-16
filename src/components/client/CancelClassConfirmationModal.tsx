'use client';

import { Modal } from '@/components/ui/Modal';
import { formatFriendlyDate } from '@/lib/utils/date';

export interface CancelClassConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Nombre visible de la clase. */
  classLabel: string;
  /** Fecha/hora de inicio de la clase. */
  classDateTime: Date | string;
  /** Coach de la clase (opcional). */
  coachName?: string | null;
}

export function CancelClassConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  classLabel,
  classDateTime,
  coachName,
}: CancelClassConfirmationModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Cancelar reservación"
      confirmLabel="Sí, cancelar mi lugar"
      cancelLabel="Volver"
      variant="danger"
    >
      <div className="space-y-3">
        <p>¿Estás segur@ de cancelar tu lugar en la clase?</p>

        <div className="rounded-DEFAULT border border-outline-variant bg-surface-container-low p-3 space-y-1">
          <p className="font-body text-sm font-semibold text-on-surface">{classLabel}</p>
          <p className="font-body text-xs text-on-surface-variant capitalize">
            {formatFriendlyDate(classDateTime)}
          </p>
          {coachName && (
            <p className="font-body text-xs text-on-surface-variant">Coach: {coachName}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
