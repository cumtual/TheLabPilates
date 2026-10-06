'use client';

import { Modal } from '@/components/ui/Modal';
import { CancellationPolicyLink } from '@/components/client/CancellationPolicyLink';
import { GRACE_PERIOD_MINUTES } from '@/lib/utils/date';

export interface CancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CancellationModal({ isOpen, onClose, onConfirm }: CancellationModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Cancelación tardía"
      confirmLabel="Confirmar cancelación"
      cancelLabel="Mantener reservación"
      variant="danger"
    >
      <div className="space-y-3">
        <p>
          Estás cancelando con menos de 24 horas de anticipación y ya pasaron más de{' '}
          {GRACE_PERIOD_MINUTES} minutos desde que reservaste.
        </p>
        <p className="font-semibold text-error">
          Esta cancelación no reembolsará tu crédito de sesión.
        </p>
        <p className="text-on-surface-variant">
          ¿Deseas continuar con la cancelación?
        </p>
        <CancellationPolicyLink />
      </div>
    </Modal>
  );
}
