'use client';

import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/Modal';
import { formatAuditDateTime } from '@/lib/utils/date';
import { TEMPERATURE_LABELS } from '@/modules/cafeteria/domain/category-tree';
import { formatPesos, MAX_AMOUNT_CENTS, parsePesos } from '@/modules/cafeteria/domain/money';
import { resolveClosingAction } from '@/modules/cafeteria/presentation/actions/admin';
import type { ClosingDetail } from '@/modules/cafeteria/presentation/types';

type Step = 'detail' | 'confirm-all' | 'partial' | 'confirm-partial';

interface Props {
  closing: ClosingDetail;
  onClose: () => void;
  /** Se llama tras resolver con éxito. */
  onResolved: (message: string) => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-semibold text-on-surface text-right">{value}</dd>
    </div>
  );
}

/** Aprobación del corte (SPEC-CAFETERIA D6, §8.2): recibido completo o con faltante. */
export function ClosingApprovalModal({ closing, onClose, onResolved }: Props) {
  const [step, setStep] = useState<Step>('detail');
  const [received, setReceived] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = parsePesos(received, { max: MAX_AMOUNT_CENTS });
  const receivedCents = parsed.ok ? parsed.cents : null;
  const shortfall = receivedCents === null ? null : closing.cashDeliveredCents - receivedCents;
  const partialError = !parsed.ok
    ? received.trim() === ''
      ? null
      : parsed.error
    : parsed.cents >= closing.cashDeliveredCents
      ? `Si recibiste ${formatPesos(closing.cashDeliveredCents)} o más, usa «Recibí el efectivo completo».`
      : null;
  const partialValid = parsed.ok && partialError === null && note.trim() !== '';
  const declared = closing.cashTotalCents - closing.cashDeliveredCents;

  function resolve(input: Record<string, unknown>) {
    startTransition(async () => {
      const result = await resolveClosingAction({ closingId: closing.id, ...input });
      if (result.success) {
        onResolved(result.data.emailSent ? 'Corte cerrado.' : 'Corte cerrado. El correo no se pudo enviar; puedes reintentar en Cortes.');
      } else {
        setError(result.error);
        setStep('detail');
      }
    });
  }

  return (
    <>
      <Modal
        isOpen={step === 'detail'}
        onClose={onClose}
        onConfirm={() => setStep('confirm-all')}
        title="Corte de caja pendiente"
        confirmLabel="Recibí el efectivo completo"
        cancelLabel="Cerrar"
        confirmDisabled={isPending}
      >
        {error && <p className="mb-3 rounded bg-error/10 p-2 text-sm text-error">{error}</p>}
        <dl className="space-y-1 text-sm">
          <Row label="Periodo" value={`${formatAuditDateTime(closing.periodStart)} – ${formatAuditDateTime(closing.periodEnd)}`} />
          <Row label="Barra" value={closing.createdByName} />
          <Row label="Pedidos" value={closing.ordersCount} />
          <Row label="Efectivo cobrado" value={formatPesos(closing.cashTotalCents)} />
          <Row label="Efectivo entregado" value={formatPesos(closing.cashDeliveredCents)} />
          {declared > 0 && <Row label="Diferencia declarada" value={formatPesos(declared)} />}
          {closing.deliveryNote && <Row label="Motivo" value={closing.deliveryNote} />}
          <Row label={`Transferencias (${closing.transferOrdersCount})`} value={formatPesos(closing.transferTotalCents)} />
          <Row label={`Cortesías (${closing.courtesyItemsCount})`} value={formatPesos(closing.courtesyValueCents)} />
          {closing.discountCents > 0 && <Row label="Descuentos a miembros" value={formatPesos(closing.discountCents)} />}
        </dl>
        {closing.transfers.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer min-h-11 flex items-center">Ver transferencias</summary>
            <ul className="space-y-1">
              {closing.transfers.map((t) => (
                <li key={t.folio} className="flex justify-between">
                  <span>
                    #{t.folio} · {formatAuditDateTime(t.createdAt)}
                  </span>
                  <span>{formatPesos(t.totalCents)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {closing.breakdown.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer min-h-11 flex items-center">Ver desglose por producto</summary>
            <ul className="space-y-1">
              {closing.breakdown.map((r) => (
                <li key={`${r.group}-${r.productName}-${r.temperature}`} className="flex justify-between gap-2">
                  <span>
                    {r.productName}
                    {r.temperature ? ` (${TEMPERATURE_LABELS[r.temperature]})` : ''} · {r.soldQuantity}
                    {r.courtesyMonthly + r.courtesyGrant > 0 ? ` + ${r.courtesyMonthly + r.courtesyGrant} cortesía` : ''}
                  </span>
                  <span>{formatPesos(r.revenueCents)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <button
          type="button"
          onClick={() => setStep('partial')}
          className="mt-4 w-full min-h-11 rounded-DEFAULT border border-error/40 font-body text-sm font-semibold text-error"
        >
          No lo recibí completo
        </button>
      </Modal>

      <Modal
        isOpen={step === 'confirm-all'}
        onClose={() => setStep('detail')}
        onConfirm={() => resolve({ outcome: 'received_all' })}
        title="Confirmar recepción"
        confirmLabel="Sí, recibí completo"
        confirmDisabled={isPending}
      >
        <p>
          Confirmas que recibiste <strong>{formatPesos(closing.cashDeliveredCents)}</strong> en efectivo. Faltante: $0.00. El corte se cerrará.
        </p>
      </Modal>

      <Modal
        isOpen={step === 'partial'}
        onClose={() => setStep('detail')}
        onConfirm={() => setStep('confirm-partial')}
        title="Registrar faltante"
        confirmLabel="Continuar"
        cancelLabel="Volver"
        variant="danger"
        confirmDisabled={!partialValid}
      >
        <label htmlFor="cashReceived" className="block text-sm font-semibold text-on-surface">
          Efectivo que recibiste
        </label>
        <input
          id="cashReceived"
          inputMode="decimal"
          value={received}
          onChange={(e) => setReceived(e.target.value)}
          className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
        />
        {partialError && <p className="mt-1 text-xs text-error">{partialError}</p>}
        <p className="mt-2 text-sm" data-testid="shortfall">
          Entregado: {formatPesos(closing.cashDeliveredCents)} · Faltante: {shortfall !== null && shortfall > 0 ? formatPesos(shortfall) : '—'}
        </p>
        <label htmlFor="shortfallNote" className="mt-3 block text-sm font-semibold text-on-surface">
          Nota (obligatoria)
        </label>
        <textarea
          id="shortfallNote"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full min-h-20 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm"
        />
      </Modal>

      <Modal
        isOpen={step === 'confirm-partial'}
        onClose={() => setStep('partial')}
        onConfirm={() => resolve({ outcome: 'received_partial', cashReceived: received, note: note.trim() })}
        title="Cerrar con faltante"
        confirmLabel="Sí, cerrar con faltante"
        variant="danger"
        confirmDisabled={isPending}
      >
        <p>
          Recibido: <strong>{formatPesos(receivedCents ?? 0)}</strong> · Faltante: <strong>{formatPesos(shortfall ?? 0)}</strong>
        </p>
        <p className="mt-2 text-sm">Nota: {note.trim()}</p>
      </Modal>
    </>
  );
}
