'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { formatAuditDateTime } from '@/lib/utils/date';
import { centsToInput, formatPesos, MAX_AMOUNT_CENTS, parsePesos } from '@/modules/cafeteria/domain/money';
import { PAYMENT_METHOD_LABELS } from '@/modules/cafeteria/domain/order';
import { createClosingAction } from '@/modules/cafeteria/presentation/actions/register';
import type { OpenShift } from '@/modules/cafeteria/presentation/types';

/** Corte de la barra (SPEC-CAFETERIA D6, A3, A4, §8.1). */
export function ClosingForm({ shift }: { shift: OpenShift }) {
  const router = useRouter();
  const { totals, orders } = shift;
  const [delivered, setDelivered] = useState(centsToInput(totals.cashTotalCents));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = parsePesos(delivered, { max: MAX_AMOUNT_CENTS });
  const deliveredCents = parsed.ok ? parsed.cents : null;
  const difference = deliveredCents === null ? 0 : totals.cashTotalCents - deliveredCents;

  function validate(): Record<string, string> {
    if (!parsed.ok) return { cashDelivered: parsed.error };
    if (parsed.cents > totals.cashTotalCents) return { cashDelivered: `No puedes entregar más de lo cobrado (${formatPesos(totals.cashTotalCents)}).` };
    if (parsed.cents < totals.cashTotalCents && note.trim() === '') return { deliveryNote: 'Explica por qué entregas menos de lo cobrado.' };
    return {};
  }

  function openConfirm() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  }

  function submit() {
    setConfirming(false);
    startTransition(async () => {
      const result = await createClosingAction({
        cashDelivered: delivered,
        deliveryNote: note.trim() || null,
        expectedOrdersCount: totals.ordersCount,
        expectedCashTotalCents: totals.cashTotalCents,
      });
      if (result.success) {
        setMessage({
          ok: true,
          text: result.data.emailSent
            ? 'Corte enviado. El admin debe confirmar que recibió el efectivo.'
            : 'Corte guardado. El correo no se pudo enviar; el admin lo verá en su panel.',
        });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <div className="space-y-5">
      {shift.pendingClosings > 0 && (
        <p className="rounded-lg border border-warm-wood/30 bg-warm-wood/15 p-3 font-body text-sm text-secondary">
          Hay {shift.pendingClosings === 1 ? 'un corte anterior pendiente' : `${shift.pendingClosings} cortes anteriores pendientes`} de aprobación del admin.
        </p>
      )}
      {message && (
        <p role="status" className={`rounded-lg p-3 font-body text-sm ${message.ok ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>
          {message.text}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Pedidos', String(totals.ordersCount)],
          ['Efectivo cobrado', formatPesos(totals.cashTotalCents)],
          [`Transferencias (${totals.transferOrdersCount})`, formatPesos(totals.transferTotalCents)],
          [`Cortesías (${totals.courtesyItemsCount})`, formatPesos(totals.courtesyValueCents)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface p-3 shadow-sm">
            <dt className="font-body text-xs text-on-surface-variant">{label}</dt>
            <dd className="font-body text-lg font-semibold text-on-surface">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3 rounded-lg bg-surface p-4 shadow-sm">
        <label htmlFor="cashDelivered" className="block font-body text-body-md font-semibold text-on-surface">
          Efectivo que entrego
        </label>
        <input
          id="cashDelivered"
          inputMode="decimal"
          value={delivered}
          onChange={(e) => setDelivered(e.target.value)}
          className="w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface font-body"
          aria-invalid={Boolean(errors.cashDelivered)}
        />
        {errors.cashDelivered && <p className="font-body text-xs text-error">{errors.cashDelivered}</p>}
        {difference > 0 && (
          <>
            <p className="font-body text-sm text-on-surface-variant">Diferencia: {formatPesos(difference)}</p>
            <label htmlFor="deliveryNote" className="block font-body text-sm font-semibold text-on-surface">
              Motivo de la diferencia
            </label>
            <textarea
              id="deliveryNote"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-20 px-3 py-2 rounded-lg border border-outline-variant bg-surface font-body text-sm"
            />
            {errors.deliveryNote && <p className="font-body text-xs text-error">{errors.deliveryNote}</p>}
          </>
        )}
        <button
          type="button"
          disabled={totals.ordersCount === 0 || isPending}
          onClick={openConfirm}
          className="w-full min-h-12 rounded-DEFAULT bg-soft-charcoal font-semibold uppercase tracking-widest text-label-caps text-on-primary disabled:opacity-50"
        >
          {isPending ? 'Enviando…' : 'Hacer corte'}
        </button>
        {totals.ordersCount === 0 && <p className="font-body text-xs text-on-surface-variant">No hay pedidos pendientes de corte.</p>}
      </div>

      {orders.length > 0 && (
        <section aria-label="Pedidos del turno" className="space-y-2">
          <h2 className="font-headline text-lg text-on-surface">Pedidos del turno</h2>
          <ul className="divide-y divide-outline-variant/30 rounded-lg bg-surface shadow-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 font-body text-sm">
                <span className="font-semibold">#{o.folio}</span>
                <span className="text-outline">{formatAuditDateTime(o.createdAt)}</span>
                <span className="flex-1 min-w-0 truncate text-on-surface-variant">{o.itemsLabel}</span>
                <span className="text-xs text-outline">{o.paymentMethod ? PAYMENT_METHOD_LABELS[o.paymentMethod] : 'Cortesía'}</span>
                <span className="w-20 text-right font-semibold">{formatPesos(o.totalCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal isOpen={confirming} onClose={() => setConfirming(false)} onConfirm={submit} title="Hacer corte de caja" confirmLabel="Sí, hacer corte">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Pedidos</dt>
            <dd className="font-semibold text-on-surface">{totals.ordersCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Efectivo cobrado</dt>
            <dd className="font-semibold text-on-surface">{formatPesos(totals.cashTotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Efectivo que entregas</dt>
            <dd className="font-semibold text-on-surface">{formatPesos(deliveredCents ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Diferencia</dt>
            <dd className="font-semibold text-on-surface">{formatPesos(difference)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm">Las transferencias ({formatPesos(totals.transferTotalCents)}) van aparte.</p>
      </Modal>
    </div>
  );
}
