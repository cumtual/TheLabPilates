'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import {
  cancelGuestAction,
  cancelReservationWithGuestAction,
  confirmLateCancelGuestAction,
  confirmLateCancelBothAction,
} from '@/actions/guest';

export interface CancelGuestDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when the dialog should close */
  onClose: () => void;
  /** ID of the titular enrollment (class_enrolleds) */
  enrollmentId: string;
  /** ID of the guest enrollment (guest_enrollments) */
  guestEnrollmentId: string;
  /** Name of the guest (for display) */
  guestName: string;
}

type DialogStep = 'options' | 'late-warning-guest' | 'late-warning-both';

/**
 * CancelGuestDialog – Modal with cancellation options when a reservation has a guest.
 *
 * Provides two options:
 * - "Cancelar solo invitado": cancels only the guest enrollment
 * - "Cancelar mi reserva y la del invitado": cancels both titular and guest
 *
 * When it's a late cancellation (<24h), shows a warning that the guest credit
 * will NOT be refunded and requires explicit confirmation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
 */
export function CancelGuestDialog({
  isOpen,
  onClose,
  enrollmentId,
  guestEnrollmentId,
  guestName,
}: CancelGuestDialogProps) {
  const [step, setStep] = useState<DialogStep>('options');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClose() {
    setStep('options');
    setError(null);
    setLoading(false);
    onClose();
  }

  async function handleCancelGuestOnly() {
    setLoading(true);
    setError(null);

    try {
      const result = await cancelGuestAction(guestEnrollmentId);

      if (result.success) {
        router.refresh();
        handleClose();
      } else if (!result.success && result.error === 'LATE_CANCELLATION') {
        setStep('late-warning-guest');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelBoth() {
    setLoading(true);
    setError(null);

    try {
      const result = await cancelReservationWithGuestAction(enrollmentId);

      if (result.success) {
        router.refresh();
        handleClose();
      } else if (!result.success && result.error === 'LATE_CANCELLATION') {
        setStep('late-warning-both');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmLateCancelGuest() {
    setLoading(true);
    setError(null);

    try {
      const result = await confirmLateCancelGuestAction(guestEnrollmentId);

      if (result.success) {
        router.refresh();
        handleClose();
      } else {
        setError(result.error);
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmLateCancelBoth() {
    setLoading(true);
    setError(null);

    try {
      const result = await confirmLateCancelBothAction(enrollmentId);

      if (result.success) {
        router.refresh();
        handleClose();
      } else {
        setError(result.error);
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // Step: Late cancellation warning for guest only (Req 4.4, 4.5, 4.6)
  if (step === 'late-warning-guest') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        onConfirm={handleConfirmLateCancelGuest}
        title="Cancelación tardía de invitado"
        confirmLabel={loading ? 'Cancelando...' : 'Confirmar cancelación'}
        cancelLabel="Mantener invitado"
        variant="danger"
      >
        <div className="space-y-3">
          <p>
            Estás cancelando a <span className="font-semibold">{guestName}</span> con
            menos de 24 horas de anticipación.
          </p>
          <p className="font-semibold text-error">
            El crédito de invitado NO será reembolsado. ¿Deseas continuar?
          </p>
          {error && (
            <p className="text-xs text-error">{error}</p>
          )}
        </div>
      </Modal>
    );
  }

  // Step: Late cancellation warning for both (Req 4.8, 4.9, 4.10)
  if (step === 'late-warning-both') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        onConfirm={handleConfirmLateCancelBoth}
        title="Cancelación tardía"
        confirmLabel={loading ? 'Cancelando...' : 'Confirmar cancelación'}
        cancelLabel="Mantener reservaciones"
        variant="danger"
      >
        <div className="space-y-3">
          <p>
            Estás cancelando tu reservación y la de tu invitado{' '}
            <span className="font-semibold">{guestName}</span> con menos de 24 horas de
            anticipación.
          </p>
          <p className="font-semibold text-error">
            El crédito de invitado NO será reembolsado. ¿Deseas continuar?
          </p>
          {error && (
            <p className="text-xs text-error">{error}</p>
          )}
        </div>
      </Modal>
    );
  }

  // Step: Options — choose what to cancel (Req 4.1, 4.2)
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      onConfirm={handleClose}
      title="Cancelar reserva con invitado"
      confirmLabel=""
      cancelLabel="Cerrar"
    >
      <div className="space-y-4">
        <p>
          Tu reserva incluye a{' '}
          <span className="font-semibold text-on-surface">{guestName}</span> como
          invitado. ¿Qué deseas cancelar?
        </p>

        <div className="flex flex-col gap-3">
          {/* Option 1: Cancel guest only (Req 4.1, 4.3) */}
          <button
            type="button"
            onClick={handleCancelGuestOnly}
            disabled={loading}
            className="w-full px-4 py-3 min-h-11 font-body text-sm font-semibold text-left text-on-surface bg-surface-container-low border border-outline-variant rounded-DEFAULT transition-colors duration-200 hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span className="block">Cancelar solo invitado</span>
            <span className="block font-normal text-xs text-outline mt-0.5">
              Tu reservación se mantiene activa
            </span>
          </button>

          {/* Option 2: Cancel both (Req 4.1, 4.7) */}
          <button
            type="button"
            onClick={handleCancelBoth}
            disabled={loading}
            className="w-full px-4 py-3 min-h-11 font-body text-sm font-semibold text-left text-error bg-error/5 border border-error/30 rounded-DEFAULT transition-colors duration-200 hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span className="block">Cancelar mi reserva y la del invitado</span>
            <span className="block font-normal text-xs text-outline mt-0.5">
              Se liberan ambos cupos
            </span>
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-2">
            <span className="inline-block h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}

        {error && (
          <p className="font-body text-xs text-error">{error}</p>
        )}
      </div>
    </Modal>
  );
}
