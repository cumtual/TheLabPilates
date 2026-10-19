import { CafeteriaError, invalid } from './errors';
import { formatPesos, sumCents, type Cents } from './money';
import type { PaymentMethod } from './order';

/**
 * Corte de caja (SPEC-CAFETERIA D6, A3, A4, §4.4):
 * pedidos pagados sin corte → `pending` → `approved` | `approved_with_shortfall`.
 */

export type ClosingStatus = 'pending' | 'approved' | 'approved_with_shortfall';

export const CLOSING_STATUS_LABELS: Record<ClosingStatus, string> = {
  pending: 'Pendiente de aprobación',
  approved: 'Aprobado',
  approved_with_shortfall: 'Aprobado con faltante',
};

export const NOTE_MAX = 500;

export interface ShiftOrder {
  status: 'paid' | 'voided';
  totalCents: Cents;
  paymentMethod: PaymentMethod | null;
  courtesyItems: number;
  courtesyValueCents: Cents;
  createdAt: Date;
}

export interface ShiftTotals {
  ordersCount: number;
  cashOrdersCount: number;
  transferOrdersCount: number;
  cashTotalCents: Cents;
  transferTotalCents: Cents;
  courtesyItemsCount: number;
  courtesyValueCents: Cents;
  periodStart: Date | null;
  periodEnd: Date | null;
}

/** Totales por método; las cortesías se informan aparte y no suman; los anulados no cuentan. */
export function summarizeShift(orders: readonly ShiftOrder[]): ShiftTotals {
  const paid = orders.filter((o) => o.status === 'paid');
  const cash = paid.filter((o) => o.paymentMethod === 'cash');
  const transfer = paid.filter((o) => o.paymentMethod === 'transfer');
  const times = paid.map((o) => o.createdAt.getTime());
  return {
    ordersCount: paid.length,
    cashOrdersCount: cash.length,
    transferOrdersCount: transfer.length,
    cashTotalCents: sumCents(cash.map((o) => o.totalCents)),
    transferTotalCents: sumCents(transfer.map((o) => o.totalCents)),
    courtesyItemsCount: paid.reduce((n, o) => n + o.courtesyItems, 0),
    courtesyValueCents: sumCents(paid.map((o) => o.courtesyValueCents)),
    periodStart: times.length ? new Date(Math.min(...times)) : null,
    periodEnd: times.length ? new Date(Math.max(...times)) : null,
  };
}

function cleanNote(note: string | null | undefined): string | null {
  const value = note?.trim() ?? '';
  if (value.length > NOTE_MAX) throw invalid(`Máximo ${NOTE_MAX} caracteres.`, 'note');
  return value === '' ? null : value;
}

/**
 * La barra declara el efectivo que entrega (A3): no más de lo cobrado y, si es menos,
 * con motivo. Devuelve la nota normalizada.
 */
export function validateDelivery(input: { cashTotalCents: Cents; cashDeliveredCents: Cents; note?: string | null }): string | null {
  const { cashTotalCents, cashDeliveredCents } = input;
  if (!Number.isInteger(cashDeliveredCents) || cashDeliveredCents < 0) {
    throw invalid('Escribe el efectivo que entregas.', 'cashDelivered');
  }
  if (cashDeliveredCents > cashTotalCents) {
    throw invalid(`No puedes entregar más de lo cobrado en efectivo (${formatPesos(cashTotalCents)}).`, 'cashDelivered');
  }
  const note = cleanNote(input.note);
  if (cashDeliveredCents < cashTotalCents && note === null) {
    throw invalid('Explica por qué entregas menos de lo cobrado.', 'deliveryNote');
  }
  return note;
}

export type ClosingOutcome =
  | { outcome: 'received_all' }
  | { outcome: 'received_partial'; cashReceivedCents: Cents; note: string };

export interface ClosingResolution {
  status: Exclude<ClosingStatus, 'pending'>;
  cashReceivedCents: Cents;
  shortfallCents: Cents;
  resolutionNote: string | null;
}

/** El admin confirma que recibió todo, o registra cuánto recibió y el faltante (D6). */
export function resolveClosing(
  closing: { status: ClosingStatus; cashDeliveredCents: Cents },
  input: ClosingOutcome
): ClosingResolution {
  if (closing.status !== 'pending') throw new CafeteriaError('ALREADY_RESOLVED', 'Este corte ya fue resuelto.');
  if (input.outcome === 'received_all') {
    return { status: 'approved', cashReceivedCents: closing.cashDeliveredCents, shortfallCents: 0, resolutionNote: null };
  }
  const received = input.cashReceivedCents;
  if (!Number.isInteger(received) || received < 0) throw invalid('Escribe el efectivo que recibiste.', 'cashReceived');
  if (received >= closing.cashDeliveredCents) {
    throw invalid(
      `Si recibiste ${formatPesos(closing.cashDeliveredCents)} o más, usa «Recibí el efectivo completo».`,
      'cashReceived'
    );
  }
  const note = cleanNote(input.note);
  if (note === null) throw invalid('Explica el faltante.', 'note');
  return {
    status: 'approved_with_shortfall',
    cashReceivedCents: received,
    shortfallCents: closing.cashDeliveredCents - received,
    resolutionNote: note,
  };
}
