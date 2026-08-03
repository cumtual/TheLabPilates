'use client';

import { Modal } from '@/components/ui/Modal';

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
          Estás cancelando con menos de 24 horas de anticipación.
        </p>
        <p className="font-semibold text-error">
          Esta cancelación no reembolsará tu crédito de sesión.
        </p>
        <p className="text-on-surface-variant">
          ¿Deseas continuar con la cancelación?
        </p>
      </div>
    </Modal>
  );
}
