'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CancellationModal } from './CancellationModal';
import { cancelReservationAction, confirmLateCancellationAction } from '@/actions/enrollment';
import { formatFriendlyDate, formatRelativeDate } from '@/lib/utils/date';

export interface ReservationItem {
  id: string;
  classDate: Date | string;
  classType: string | null;
  coachName: string | null;
}

export interface ReservationCardProps {
  reservation: ReservationItem;
}

const classTypeLabels: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

export function ReservationCard({ reservation }: ReservationCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLateCancelModal, setShowLateCancelModal] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const router = useRouter();

  async function handleCancel() {
    setLoading(true);
    setError(null);

    try {
      const result = await cancelReservationAction(reservation.id);
      if (result.success) {
        setCancelled(true);
        router.refresh();
      } else if (!result.success && result.field === 'late') {
        // Late cancellation — show warning modal
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

      <CancellationModal
        isOpen={showLateCancelModal}
        onClose={() => setShowLateCancelModal(false)}
        onConfirm={handleConfirmLateCancellation}
      />
    </>
  );
}
