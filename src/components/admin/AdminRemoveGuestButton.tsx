'use client';

import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { adminRemoveGuestAction } from '@/actions/admin-guest';
import type { GuestOrigin } from '@/lib/types/guest';

export interface AdminRemoveGuestButtonProps {
  /** ID of the guest enrollment to remove */
  guestEnrollmentId: string;
  /** Display name of the guest */
  guestName: string;
  /** Origin of the guest enrollment */
  origin: GuestOrigin;
  /** Callback invoked on successful removal */
  onSuccess?: () => void;
}

/**
 * Button to remove an admin-added guest from a class.
 *
 * - Disabled with tooltip when origin='user' (Req 6.8)
 * - Shows confirmation dialog before executing removal (Req 6.6)
 * - Calls adminRemoveGuestAction and liberates 1 spot on success (Req 6.7)
 * - WCAG compliant: 44x44px touch target, keyboard accessible
 */
export function AdminRemoveGuestButton({
  guestEnrollmentId,
  guestName,
  origin,
  onSuccess,
}: AdminRemoveGuestButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDisabled = origin !== 'admin';

  function handleClick() {
    if (isDisabled) return;
    setError(null);
    setShowConfirm(true);
  }

  function handleCancel() {
    setShowConfirm(false);
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await adminRemoveGuestAction(guestEnrollmentId);

      if (result.success) {
        setShowConfirm(false);
        onSuccess?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <div className="relative inline-flex group">
        <button
          type="button"
          onClick={handleClick}
          disabled={isDisabled}
          aria-label={
            isDisabled
              ? `No se puede eliminar al invitado ${guestName}`
              : `Eliminar invitado ${guestName}`
          }
          aria-describedby={isDisabled ? `tooltip-${guestEnrollmentId}` : undefined}
          className={[
            'inline-flex items-center justify-center px-3 py-2',
            'min-h-11 min-w-11',
            'font-body text-sm font-medium rounded-lg',
            'transition-all duration-200 ease-out',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error',
            isDisabled
              ? 'text-outline border border-outline/30 cursor-not-allowed opacity-50'
              : 'text-error border border-error/30 hover:bg-error/10 cursor-pointer',
          ].join(' ')}
        >
          Eliminar
        </button>

        {/* Tooltip for disabled state */}
        {isDisabled && (
          <span
            id={`tooltip-${guestEnrollmentId}`}
            role="tooltip"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 font-body text-xs text-on-primary bg-soft-charcoal rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 z-10"
          >
            No se puede eliminar
          </span>
        )}
      </div>

      {/* Error message inline */}
      {error && (
        <p
          className="mt-2 font-body text-sm text-error"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}

      {/* Confirmation dialog */}
      <Modal
        isOpen={showConfirm}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title="Eliminar invitado"
        confirmLabel={isPending ? 'Eliminando...' : 'Eliminar'}
        cancelLabel="Cancelar"
        variant="danger"
      >
        {isPending ? (
          <div className="flex items-center gap-3">
            <Spinner size="sm" />
            <span>Eliminando invitado...</span>
          </div>
        ) : (
          <p>
            ¿Estás seguro de eliminar al invitado{' '}
            <strong>{guestName}</strong>?
          </p>
        )}
      </Modal>
    </>
  );
}
