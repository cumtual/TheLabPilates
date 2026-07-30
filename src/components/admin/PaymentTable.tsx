'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { confirmPaymentAction } from '@/actions/admin';

interface PendingPayment {
  paymentId: string;
  clientName: string;
  clientEmail: string;
  paymentType: 'cash' | 'transfer' | 'card';
  amount: number | null;
  createdAt: string;
  subscriptionName: string | null;
}

interface PaymentTableProps {
  payments: PendingPayment[];
}

const paymentTypeLabels: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
};

export function PaymentTable({ payments }: PaymentTableProps) {
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleConfirm(paymentId: string) {
    setError(null);
    setSuccessMessage(null);
    setPendingId(paymentId);

    startTransition(async () => {
      const result = await confirmPaymentAction(paymentId);

      if (result.success) {
        setConfirmedIds((prev) => new Set([...prev, paymentId]));
        setSuccessMessage(result.message ?? 'Pago confirmado exitosamente.');
      } else {
        setError(result.error);
      }
      setPendingId(null);
    });
  }

  const visiblePayments = payments.filter((p) => !confirmedIds.has(p.paymentId));

  if (visiblePayments.length === 0) {
    return (
      <Card>
        <p className="font-body text-sm text-outline text-center py-8">
          No hay pagos pendientes de confirmación.
        </p>
      </Card>
    );
  }

  const visibleGrouped = visiblePayments.reduce(
    (acc, payment) => {
      const type = payment.paymentType;
      if (!acc[type]) acc[type] = [];
      acc[type].push(payment);
      return acc;
    },
    {} as Record<string, PendingPayment[]>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3">
          <p className="font-body text-sm text-error">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
          <p className="font-body text-sm text-primary">{successMessage}</p>
        </div>
      )}

      {Object.entries(visibleGrouped).map(([type, groupPayments]) => (
        <div key={type} className="space-y-3">
          <h2 className="font-headline text-body-lg text-on-surface">
            {paymentTypeLabels[type] ?? type}
          </h2>

          <div className="space-y-3">
            {groupPayments.map((payment) => (
              <Card key={payment.paymentId}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="font-body text-sm font-semibold text-on-surface">
                      {payment.clientName}
                    </p>
                    <p className="font-body text-xs text-outline">
                      {payment.clientEmail}
                    </p>
                    {payment.subscriptionName && (
                      <p className="font-body text-xs text-on-surface-variant">
                        {payment.subscriptionName}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="pending">
                        {paymentTypeLabels[payment.paymentType]}
                      </Badge>
                      {payment.amount != null && (
                        <span className="font-body text-sm font-medium text-on-surface">
                          ${payment.amount}
                        </span>
                      )}
                      <span className="font-body text-xs text-outline">
                        {payment.createdAt}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleConfirm(payment.paymentId)}
                    disabled={isPending && pendingId === payment.paymentId}
                    className="inline-flex items-center justify-center px-5 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-primary text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none min-h-11 min-w-11"
                  >
                    {isPending && pendingId === payment.paymentId
                      ? 'Confirmando...'
                      : 'Confirmar'}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
