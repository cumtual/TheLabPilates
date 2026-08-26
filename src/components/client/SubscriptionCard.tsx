'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { purchaseSubscriptionAction } from '@/actions/subscription';

export interface SubscriptionPackage {
  id: string;
  name: string | null;
  sessions: number | null;
  guest: boolean | null;
  price: number | null;
}

export interface ActiveBankCard {
  cardName: string;
  cardNumber: string;
  cardBank: string;
}

interface SubscriptionCardProps {
  pkg: SubscriptionPackage;
  hasPendingPayment: boolean;
  activeCard?: ActiveBankCard | null;
}

const methodLabels: Record<string, string> = {
  transfer: 'Transferencia bancaria',
  cash: 'Efectivo',
};

export function SubscriptionCard({ pkg, hasPendingPayment, activeCard }: SubscriptionCardProps) {
  const [selectedMethod, setSelectedMethod] = useState<'transfer' | 'cash' | null>(null);
  const [confirmMethod, setConfirmMethod] = useState<'transfer' | 'cash' | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  function handleConfirmPurchase() {
    if (!confirmMethod) return;
    const method = confirmMethod;
    setConfirmMethod(null);
    setSelectedMethod(method);
    startTransition(async () => {
      const res = await purchaseSubscriptionAction(pkg.id, method);
      if (res.success) {
        setResult({ success: true, message: res.message });
      } else {
        setResult({ success: false, error: res.error });
      }
    });
  }

  return (
    <>
    <Card className="flex flex-col gap-4">
      {/* Package Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-headline text-headline-lg-mobile text-on-surface">
          {pkg.name ?? 'Paquete'}
        </h3>
        {pkg.guest && (
          <Badge variant="active">+1 Invitado</Badge>
        )}
      </div>

      {/* Package Info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-body text-body-md text-on-surface-variant">
            Sesiones
          </span>
          <span className="font-body text-body-md font-semibold text-on-surface">
            {pkg.guest ? "Ilimitadas" : (pkg.sessions ?? 0)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-body text-body-md text-on-surface-variant">
            Precio
          </span>
          <span className="font-body text-body-md font-semibold text-on-surface">
            ${pkg.price ?? 0} MXN
          </span>
        </div>
      </div>

      {/* Result Messages */}
      {result?.success && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
          <p className="font-body text-body-sm text-primary font-medium">
            {result.message}
          </p>
          {selectedMethod === 'transfer' && (
            <div className="mt-3 p-3 rounded bg-surface-container-low border border-outline-variant/40">
              <p className="font-body text-body-sm font-semibold text-on-surface mb-1">
                Datos bancarios:
              </p>
              {activeCard ? (
                <p className="font-body text-body-sm text-on-surface-variant">
                  Banco: {activeCard.cardBank}<br />
                  Cuenta/CLABE: {activeCard.cardNumber}<br />
                  Beneficiario: {activeCard.cardName}
                </p>
              ) : (
                <p className="font-body text-body-sm text-on-surface-variant">
                  No hay datos bancarios configurados. Contacta al administrador.
                </p>
              )}
            </div>
          )}
          {selectedMethod === 'cash' && (
            <div className="mt-3 p-3 rounded bg-surface-container-low border border-outline-variant/40">
              <p className="font-body text-body-sm text-on-surface-variant">
                Acude al estudio para realizar tu pago en efectivo. El administrador confirmará tu pago y activará tu suscripción.
              </p>
            </div>
          )}
        </div>
      )}

      {result && !result.success && (
        <div className="p-3 rounded-lg bg-error/10 border border-error/30">
          <p className="font-body text-body-sm text-error font-medium">
            {result.error}
          </p>
        </div>
      )}

      {/* Payment Methods */}
      {!result?.success && (
        <div className="space-y-2 pt-2 border-t border-outline-variant/40">
          <p className="font-body text-body-sm text-on-surface-variant font-medium">
            Método de pago:
          </p>
          <div className="flex flex-col gap-2">
            {/* Transfer */}
            <button
              type="button"
              onClick={() => setConfirmMethod('transfer')}
              disabled={isPending || hasPendingPayment}
              className="min-h-11 px-4 py-3 w-full font-body text-body-md font-semibold text-on-primary bg-soft-charcoal rounded-DEFAULT transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isPending && selectedMethod === 'transfer' ? (
                <Spinner size="sm" className="mx-auto" />
              ) : (
                'Transferencia bancaria'
              )}
            </button>

            {/* Cash */}
            <button
              type="button"
              onClick={() => setConfirmMethod('cash')}
              disabled={isPending || hasPendingPayment}
              className="min-h-11 px-4 py-3 w-full font-body text-body-md font-semibold text-soft-charcoal bg-transparent border border-soft-charcoal rounded-DEFAULT transition-all duration-200 hover:-translate-y-0.5 hover:bg-soft-charcoal hover:text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isPending && selectedMethod === 'cash' ? (
                <Spinner size="sm" className="mx-auto" />
              ) : (
                'Efectivo'
              )}
            </button>

            {/* Card — Disabled with "Próximamente" */}
            <button
              type="button"
              disabled
              className="min-h-11 px-4 py-3 w-full font-body text-body-md font-semibold text-outline bg-surface-container-high border border-outline-variant rounded-DEFAULT cursor-not-allowed"
            >
              Tarjeta — Próximamente
            </button>
          </div>

          {hasPendingPayment && (
            <p className="font-body text-body-sm text-warm-wood mt-2">
              Ya tienes un pago pendiente. Espera la confirmación del administrador.
            </p>
          )}
        </div>
      )}
    </Card>

    {/* Purchase Confirmation Modal */}
    <Modal
      isOpen={confirmMethod !== null}
      onClose={() => setConfirmMethod(null)}
      onConfirm={handleConfirmPurchase}
      title="Confirmar compra"
      confirmLabel="Sí, adquirir"
      cancelLabel="Cancelar"
      variant="default"
    >
      <div className="space-y-3">
        <p>¿Deseas adquirir el paquete <strong>{pkg.name}</strong> con el método de pago <strong>{confirmMethod ? methodLabels[confirmMethod] : ''}</strong>?</p>
        <div className="bg-surface-container-low rounded-lg p-3 space-y-1">
          <p className="font-body text-sm text-on-surface-variant">
            Sesiones: <span className="font-semibold text-on-surface">{pkg.guest ? "Ilimitadas" : (pkg.sessions ?? 0)}</span>
          </p>
          <p className="font-body text-sm text-on-surface-variant">
            Precio: <span className="font-semibold text-on-surface">${pkg.price ?? 0} MXN</span>
          </p>
        </div>
        <p className="text-sm text-on-surface-variant">
          Tu suscripción se activará una vez que el administrador confirme tu pago.
        </p>
      </div>
    </Modal>
    </>
  );
}
