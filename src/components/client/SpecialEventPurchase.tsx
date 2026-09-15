'use client';

import { useState, useTransition } from 'react';
import { purchaseSpecialEventAction } from '@/actions/event';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { formatFullDateTime } from '@/lib/utils/date';
import { getClassDisplayName } from '@/lib/utils/class-type';

export interface EventClassOption {
  id: string;
  classType: string | null;
  customName: string | null;
  classDate: string | null;
  coachName: string | null;
  available: number;
}

export interface EventBankCard {
  cardName: string;
  cardNumber: string;
  cardBank: string;
}

interface SpecialEventPurchaseProps {
  eventId: string;
  basePrice: number;
  finalPrice: number;
  classes: EventClassOption[];
  activeCard: EventBankCard | null;
}

export function SpecialEventPurchase({
  eventId,
  basePrice,
  finalPrice,
  classes,
  activeCard,
}: SpecialEventPurchaseProps) {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [method, setMethod] = useState<'transfer' | 'cash' | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [confirmMethod, setConfirmMethod] = useState<'transfer' | 'cash' | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const hasDiscount = finalPrice < basePrice;
  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null;
  const canPurchase = !!selectedClassId && !!method && accepted && !isPending;

  function handleSubmit() {
    if (!selectedClassId || !method) return;
    setConfirmMethod(method);
  }

  function handleConfirmPurchase() {
    if (!selectedClassId || !confirmMethod) return;
    const paymentType = confirmMethod;
    setConfirmMethod(null);
    startTransition(async () => {
      const res = await purchaseSpecialEventAction(eventId, selectedClassId, paymentType, accepted);
      if (res.success) {
        setResult({ success: true, message: res.message });
      } else {
        setResult({ success: false, error: res.error });
      }
    });
  }

  if (result?.success) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <div className="space-y-3">
          <p className="font-body text-body-md text-primary font-semibold">{result.message}</p>
          {method === 'transfer' && (
            <div className="p-3 rounded bg-surface-container-low border border-outline-variant/40">
              <p className="font-body text-sm font-semibold text-on-surface mb-1">Datos bancarios:</p>
              {activeCard ? (
                <p className="font-body text-sm text-on-surface-variant">
                  Banco: {activeCard.cardBank}
                  <br />
                  Cuenta/CLABE: {activeCard.cardNumber}
                  <br />
                  Beneficiario: {activeCard.cardName}
                </p>
              ) : (
                <p className="font-body text-sm text-on-surface-variant">
                  No hay datos bancarios configurados. Contacta al administrador.
                </p>
              )}
            </div>
          )}
          {method === 'cash' && (
            <p className="font-body text-sm text-on-surface-variant">
              Acude al estudio para realizar tu pago en efectivo. El administrador confirmará tu pago
              y garantizará tu lugar.
            </p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="space-y-5">
          {result && !result.success && (
            <p role="alert" className="font-body text-sm text-error bg-error/10 rounded-DEFAULT px-4 py-3">
              {result.error}
            </p>
          )}

          <div className="flex items-center justify-between">
            <span className="font-body text-body-md text-on-surface-variant">Precio</span>
            <span className="font-body text-body-md font-semibold text-on-surface">
              {hasDiscount && (
                <span className="text-outline line-through mr-2">${basePrice} MXN</span>
              )}
              ${finalPrice} MXN
            </span>
          </div>

          <div className="space-y-2">
            <p className="font-body text-body-md font-semibold text-on-surface">
              Selecciona una clase
            </p>
            {classes.length === 0 ? (
              <p className="font-body text-sm text-outline">El evento aún no tiene clases disponibles.</p>
            ) : (
              <div className="space-y-2">
                {classes.map((cls) => {
                  const soldOut = cls.available < 1;
                  return (
                    <label
                      key={cls.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                        soldOut
                          ? 'border-outline-variant/40 opacity-60 cursor-not-allowed'
                          : selectedClassId === cls.id
                            ? 'border-primary bg-primary/5 cursor-pointer'
                            : 'border-outline-variant/40 hover:bg-surface-container-low cursor-pointer'
                      }`}
                    >
                      <input
                        type="radio"
                        name="event-class"
                        value={cls.id}
                        disabled={soldOut}
                        checked={selectedClassId === cls.id}
                        onChange={() => setSelectedClassId(cls.id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1">
                        <span className="block font-body text-sm font-semibold text-on-surface">
                          {getClassDisplayName(cls.classType, cls.customName)}
                        </span>
                        <span className="block font-body text-xs text-on-surface-variant capitalize">
                          {cls.classDate ? formatFullDateTime(new Date(cls.classDate)) : 'Sin fecha'}
                          {cls.coachName ? ` · ${cls.coachName}` : ''}
                        </span>
                      </span>
                      <span className="font-body text-xs font-semibold whitespace-nowrap">
                        {soldOut ? (
                          <span className="text-error">SOLD OUT</span>
                        ) : (
                          <span className="text-on-surface-variant">{cls.available} lugares</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="font-body text-body-md font-semibold text-on-surface">Método de pago</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setMethod('transfer')}
                disabled={!selectedClassId}
                className={`flex-1 min-h-11 px-4 py-3 font-body text-sm font-semibold rounded-DEFAULT border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  method === 'transfer'
                    ? 'bg-soft-charcoal text-on-primary border-soft-charcoal'
                    : 'bg-transparent text-soft-charcoal border-soft-charcoal hover:bg-soft-charcoal hover:text-on-primary'
                }`}
              >
                Transferencia bancaria
              </button>
              <button
                type="button"
                onClick={() => setMethod('cash')}
                disabled={!selectedClassId}
                className={`flex-1 min-h-11 px-4 py-3 font-body text-sm font-semibold rounded-DEFAULT border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  method === 'cash'
                    ? 'bg-soft-charcoal text-on-primary border-soft-charcoal'
                    : 'bg-transparent text-soft-charcoal border-soft-charcoal hover:bg-soft-charcoal hover:text-on-primary'
                }`}
              >
                Efectivo
              </button>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="font-body text-sm text-on-surface-variant">
              Entiendo y acepto que esta compra es <strong className="text-on-surface">definitiva</strong> y
              que <strong className="text-on-surface">no aplica cancelación ni devolución</strong>, ni la
              regla de 24 horas.
            </span>
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canPurchase}
            className="w-full min-h-11 px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isPending ? <Spinner size="sm" className="mx-auto" /> : 'Reservar lugar'}
          </button>
        </div>
      </Card>

      <Modal
        isOpen={confirmMethod !== null}
        onClose={() => setConfirmMethod(null)}
        onConfirm={handleConfirmPurchase}
        title="Confirmar inscripción"
        confirmLabel="Sí, confirmar"
        cancelLabel="Cancelar"
      >
        <div className="space-y-3">
          <p>
            Clase: <strong>{selectedClass ? getClassDisplayName(selectedClass.classType, selectedClass.customName) : ''}</strong>
          </p>
          <p>
            Total a pagar: <strong>${finalPrice} MXN</strong> (
            {confirmMethod === 'transfer' ? 'Transferencia bancaria' : 'Efectivo'})
          </p>
          <p className="text-sm text-on-surface-variant">
            Tu lugar quedará garantizado únicamente cuando el administrador confirme tu pago.
          </p>
          <p className="text-sm font-semibold text-error">
            Recuerda: la compra es definitiva y no tiene devolución.
          </p>
        </div>
      </Modal>
    </>
  );
}
