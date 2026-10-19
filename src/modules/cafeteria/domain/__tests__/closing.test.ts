import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { resolveClosing, summarizeShift, validateDelivery, type ShiftOrder } from '../closing';
import { CafeteriaError } from '../errors';

/** Corte de caja (SPEC-CAFETERIA D6, A3, TASK-CF-DOM-04). */

const order = (overrides: Partial<ShiftOrder>): ShiftOrder => ({
  status: 'paid',
  totalCents: 0,
  paymentMethod: null,
  courtesyItems: 0,
  courtesyValueCents: 0,
  createdAt: new Date('2026-10-15T15:00:00Z'),
  ...overrides,
});

const errorOf = (fn: () => unknown): CafeteriaError => {
  try {
    fn();
  } catch (e) {
    return e as CafeteriaError;
  }
  throw new Error('no lanzó');
};

describe('summarizeShift', () => {
  it('totales por método; cortesías aparte; anulados excluidos', () => {
    const totals = summarizeShift([
      order({ totalCents: 8400, paymentMethod: 'cash', createdAt: new Date('2026-10-15T14:00:00Z') }),
      order({ totalCents: 4250, paymentMethod: 'cash', courtesyItems: 1, courtesyValueCents: 6500 }),
      order({ totalCents: 9000, paymentMethod: 'transfer', createdAt: new Date('2026-10-15T18:00:00Z') }),
      order({ totalCents: 0, paymentMethod: null, courtesyItems: 2, courtesyValueCents: 9000 }),
      order({ status: 'voided', totalCents: 99999, paymentMethod: 'cash', createdAt: new Date('2026-10-15T20:00:00Z') }),
    ]);
    expect(totals).toEqual({
      ordersCount: 4,
      cashOrdersCount: 2,
      transferOrdersCount: 1,
      cashTotalCents: 12650,
      transferTotalCents: 9000,
      courtesyItemsCount: 3,
      courtesyValueCents: 15500,
      periodStart: new Date('2026-10-15T14:00:00Z'),
      periodEnd: new Date('2026-10-15T18:00:00Z'),
    });
  });
});

describe('validateDelivery (A3)', () => {
  it('entregado > cobrado → error', () => {
    expect(errorOf(() => validateDelivery({ cashTotalCents: 1000, cashDeliveredCents: 1001 })).field).toBe('cashDelivered');
  });

  it('entregado < cobrado sin nota → error; con nota pasa', () => {
    expect(errorOf(() => validateDelivery({ cashTotalCents: 1000, cashDeliveredCents: 900, note: '  ' })).field).toBe('deliveryNote');
    expect(validateDelivery({ cashTotalCents: 1000, cashDeliveredCents: 900, note: ' Cambio a un cliente ' })).toBe('Cambio a un cliente');
  });

  it('igual no exige nota', () => {
    expect(validateDelivery({ cashTotalCents: 1000, cashDeliveredCents: 1000 })).toBeNull();
  });
});

describe('resolveClosing', () => {
  const pending = { status: 'pending' as const, cashDeliveredCents: 10000 };

  it('completo: recibido = entregado, faltante 0, approved', () => {
    expect(resolveClosing(pending, { outcome: 'received_all' })).toEqual({ status: 'approved', cashReceivedCents: 10000, shortfallCents: 0, resolutionNote: null });
  });

  it('parcial: exige nota, calcula el faltante, approved_with_shortfall', () => {
    expect(resolveClosing(pending, { outcome: 'received_partial', cashReceivedCents: 9500, note: 'Faltó un billete' })).toEqual({
      status: 'approved_with_shortfall',
      cashReceivedCents: 9500,
      shortfallCents: 500,
      resolutionNote: 'Faltó un billete',
    });
    expect(errorOf(() => resolveClosing(pending, { outcome: 'received_partial', cashReceivedCents: 9500, note: '' })).field).toBe('note');
  });

  it('parcial con recibido ≥ entregado → error', () => {
    expect(errorOf(() => resolveClosing(pending, { outcome: 'received_partial', cashReceivedCents: 10000, note: 'x' })).field).toBe('cashReceived');
    expect(errorOf(() => resolveClosing(pending, { outcome: 'received_partial', cashReceivedCents: 10001, note: 'x' })).field).toBe('cashReceived');
  });

  it('un corte resuelto no cambia', () => {
    expect(errorOf(() => resolveClosing({ status: 'approved', cashDeliveredCents: 1 }, { outcome: 'received_all' })).code).toBe('ALREADY_RESOLVED');
  });
});

describe('propiedad', () => {
  it('cobrado = entregado + diferencia declarada y entregado = recibido + faltante', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 0.999, noNaN: true }), (cash, d, r) => {
        const delivered = Math.floor(cash * d);
        validateDelivery({ cashTotalCents: cash, cashDeliveredCents: delivered, note: 'motivo' });
        expect(cash - delivered).toBeGreaterThanOrEqual(0);
        fc.pre(delivered > 0);
        const received = Math.floor(delivered * r);
        const res = resolveClosing({ status: 'pending', cashDeliveredCents: delivered }, { outcome: 'received_partial', cashReceivedCents: received, note: 'x' });
        expect(res.cashReceivedCents + res.shortfallCents).toBe(delivered);
      })
    );
  });
});
