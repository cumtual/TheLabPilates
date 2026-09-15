'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmEventPaymentAction,
  rejectEventPaymentAction,
  markRefundedAction,
} from '@/actions/admin-events';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

export interface EventRegistrationItem {
  id: string;
  userName: string;
  userEmail: string;
  amountPaid: number;
  paymentType: 'cash' | 'transfer' | 'card';
  status: 'pending' | 'confirmed' | 'refund_pending' | 'refunded';
}

const paymentTypeLabel: Record<EventRegistrationItem['paymentType'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
};

const statusBadge: Record<
  EventRegistrationItem['status'],
  { variant: 'pending' | 'confirmed' | 'cancelled' | 'expired'; label: string }
> = {
  pending: { variant: 'pending', label: 'Pago pendiente' },
  confirmed: { variant: 'confirmed', label: 'Confirmado' },
  refund_pending: { variant: 'cancelled', label: 'Reembolso pendiente' },
  refunded: { variant: 'expired', label: 'Reembolsado' },
};

export function EventRegistrationRow({ registration }: { registration: EventRegistrationItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? 'No se pudo completar la acción.');
      }
    });
  }

  const badge = statusBadge[registration.status];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-outline-variant/40 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1 flex-1">
        <p className="font-body text-sm font-semibold text-on-surface">{registration.userName}</p>
        <p className="font-body text-xs text-on-surface-variant">{registration.userEmail}</p>
        <p className="font-body text-xs text-on-surface-variant">
          ${registration.amountPaid} MXN · {paymentTypeLabel[registration.paymentType]}
        </p>
        {error && (
          <p role="alert" className="font-body text-xs text-error">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={badge.variant}>{badge.label}</Badge>

        {registration.status === 'pending' && (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => confirmEventPaymentAction(registration.id))}
              className="inline-flex items-center justify-center min-h-11 px-4 py-2 font-body text-xs font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowReject(true)}
              className="inline-flex items-center justify-center min-h-11 px-4 py-2 font-body text-xs font-semibold uppercase tracking-wider bg-transparent border border-error text-error rounded-DEFAULT transition-colors hover:bg-error hover:text-on-primary disabled:opacity-50"
            >
              Rechazar
            </button>
          </>
        )}

        {registration.status === 'refund_pending' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => markRefundedAction(registration.id))}
            className="inline-flex items-center justify-center min-h-11 px-4 py-2 font-body text-xs font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
          >
            Marcar reembolsado
          </button>
        )}
      </div>

      <Modal
        isOpen={showReject}
        onClose={() => setShowReject(false)}
        onConfirm={() => {
          setShowReject(false);
          run(() => rejectEventPaymentAction(registration.id));
        }}
        title="Rechazar pago"
        confirmLabel="Sí, rechazar"
        cancelLabel="Volver"
        variant="danger"
      >
        <p>
          Se eliminará la inscripción de <strong>{registration.userName}</strong> y su pago. El
          usuario podrá volver a intentar la compra.
        </p>
      </Modal>
    </div>
  );
}
