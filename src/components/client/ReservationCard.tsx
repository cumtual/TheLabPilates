'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CancellationModal } from './CancellationModal';
import { CancelGuestDialog } from './CancelGuestDialog';
import { AddGuestButton } from './AddGuestButton';
import { cancelReservationAction, confirmLateCancellationAction } from '@/actions/enrollment';
import { addGuestToReservationAction } from '@/actions/guest';
import { formatFriendlyDate, formatRelativeDate } from '@/lib/utils/date';

export interface ReservationItem {
  id: string;
  classDate: Date | string;
  classType: string | null;
  coachName: string | null;
}

export interface GuestInfo {
  guestEnrollmentId: string;
  guestName: string;
}

export interface ReservationCardProps {
  reservation: ReservationItem;
  /** Associated active guest enrollment, if any */
  guest?: GuestInfo | null;
  /** Whether the class has available capacity (for AddGuestButton) */
  hasCapacity?: boolean;
  /** Whether the user is eligible to add guests (Open Lab + credits) */
  isEligible?: boolean;
}

const classTypeLabels: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

export function ReservationCard({
  reservation,
  guest = null,
  hasCapacity = false,
  isEligible = false,
}: ReservationCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLateCancelModal, setShowLateCancelModal] = useState(false);
  const [showGuestCancelDialog, setShowGuestCancelDialog] = useState(false);
  const [guestDialogInfo, setGuestDialogInfo] = useState<GuestInfo | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const router = useRouter();

  const isPastClass = new Date(reservation.classDate) < new Date();
  const hasGuest = guest !== null;

  async function handleCancel() {
    setLoading(true);
    setError(null);

    try {
      const result = await cancelReservationAction(reservation.id);
      if (result.success) {
        setCancelled(true);
        router.refresh();
      } else if (!result.success && result.error === 'HAS_GUEST') {
        // The reservation has an associated guest — open CancelGuestDialog
        // The field contains the guestEnrollmentId
        const guestEnrollmentId = result.field ?? guest?.guestEnrollmentId ?? '';
        const guestName = guest?.guestName ?? 'Invitado';
        setGuestDialogInfo({ guestEnrollmentId, guestName });
        setShowGuestCancelDialog(true);
      } else if (!result.success && result.field === 'late') {
        // Late cancellation — show warning modal (no guest)
        setShowLateCancelModal(true);
      } else {
        setError(result.error);
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmLateCancellation() {
    setLoading(true);
    setError(null);
    setShowLateCancelModal(false);

    try {
      const result = await confirmLateCancellationAction(reservation.id);
      if (result.success) {
        setCancelled(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddGuest(enrollmentId: string, guestName: string) {
    const result = await addGuestToReservationAction(enrollmentId, guestName);
    if (!result.success) {
      throw new Error(result.error);
    }
    router.refresh();
  }

  if (cancelled) {
    return (
      <Card className="opacity-60">
        <div className="flex items-center justify-between">
          <p className="font-body text-sm text-outline">Reservación cancelada</p>
          <Badge variant="cancelled">Cancelada</Badge>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h3 className="font-body text-base font-semibold text-on-surface">
                {reservation.classType
                  ? classTypeLabels[reservation.classType] ?? reservation.classType
                  : 'Clase'}
              </h3>
              <p className="font-body text-sm text-outline capitalize">
                {formatFriendlyDate(reservation.classDate)}
              </p>
              {formatRelativeDate(reservation.classDate) && (
                <p className="font-body text-xs text-primary font-medium">
                  {formatRelativeDate(reservation.classDate)}
                </p>
              )}
            </div>
            <Badge variant="pending">Pendiente</Badge>
          </div>

          {reservation.coachName && (
            <p className="font-body text-sm text-on-surface-variant">
              Coach: {reservation.coachName}
            </p>
          )}

          {/* Guest info indicator when guest is present */}
          {hasGuest && guest && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-DEFAULT">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 text-primary"
                aria-hidden="true"
              >
                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
              </svg>
              <span className="font-body text-sm text-on-surface">
                Invitado: <span className="font-semibold">{guest.guestName}</span>
              </span>
            </div>
          )}

          {/* AddGuestButton: shown when no guest, eligible, class not past, has capacity */}
          {!hasGuest && !isPastClass && (
            <AddGuestButton
              enrollmentId={reservation.id}
              hasGuest={hasGuest}
              hasCapacity={hasCapacity}
              isEligible={isEligible}
              isPastClass={isPastClass}
              onAddGuest={handleAddGuest}
            />
          )}

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="inline-flex items-center justify-center px-4 py-2 min-h-11 min-w-11 font-body text-sm font-semibold uppercase tracking-wider bg-error/10 text-error border border-error/30 rounded-DEFAULT transition-all duration-200 ease-out hover:bg-error/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-block h-4 w-4 rounded-full border-2 border-error/30 border-t-error animate-spin" />
              ) : (
                'Cancelar'
              )}
            </button>
          </div>

          {error && (
            <p className="font-body text-xs text-error text-right">{error}</p>
          )}
        </div>
      </Card>

      {/* Standard late cancellation modal (no guest) */}
      <CancellationModal
        isOpen={showLateCancelModal}
        onClose={() => setShowLateCancelModal(false)}
        onConfirm={handleConfirmLateCancellation}
      />

      {/* Guest cancellation dialog — shown when reservation has a guest */}
      {guestDialogInfo && (
        <CancelGuestDialog
          isOpen={showGuestCancelDialog}
          onClose={() => {
            setShowGuestCancelDialog(false);
            setGuestDialogInfo(null);
          }}
          enrollmentId={reservation.id}
          guestEnrollmentId={guestDialogInfo.guestEnrollmentId}
          guestName={guestDialogInfo.guestName}
        />
      )}
    </>
  );
}
