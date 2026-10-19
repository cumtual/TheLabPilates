import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SalesReport } from '@/modules/cafeteria/presentation/types';

vi.mock('@/modules/cafeteria/presentation/actions/admin', () => ({ getSalesReportAction: vi.fn(), voidOrderAction: vi.fn() }));

import { getSalesReportAction, voidOrderAction } from '@/modules/cafeteria/presentation/actions/admin';
import { SalesDashboard } from '../SalesDashboard';

/** Ventas del admin (SPEC-CAFETERIA A5, D8, TASK-CF-ADM-05). */

const report: SalesReport = {
  range: { from: '2026-10-15', to: '2026-10-15' },
  totals: { ordersCount: 2, cashTotalCents: 13000, transferTotalCents: 4500, totalCents: 17500, courtesyItems: 2, courtesyMonthly: 1, courtesyGrant: 1, courtesyValueCents: 11000, discountCents: 0, voidedCount: 1 },
  breakdown: [{ group: 'Bebidas › Café', productName: 'Latte', temperature: 'hot', soldQuantity: 2, revenueCents: 13000, courtesyMonthly: 1, courtesyGrant: 0, courtesyValueCents: 6500 }],
  orders: [
    { id: 'o1', folio: 1, createdAt: new Date('2026-10-15T16:00:00Z'), status: 'paid', customerLabel: 'Mesa 1', paymentMethod: 'cash', totalCents: 13000, discountCents: 0, discountLabel: null, closed: false, voidReason: null, lines: [{ productName: 'Latte', group: 'Bebidas › Café', quantity: 2, lineTotalCents: 13000, isCourtesy: false, courtesySource: null }] },
    { id: 'o2', folio: 2, createdAt: new Date('2026-10-15T17:00:00Z'), status: 'paid', customerLabel: 'Carla', paymentMethod: null, totalCents: 0, discountCents: 0, discountLabel: null, closed: true, voidReason: null, lines: [
      { productName: 'Latte', group: 'Bebidas › Café', quantity: 1, lineTotalCents: 0, isCourtesy: true, courtesySource: 'monthly' },
      { productName: 'Brownie', group: 'Comida › Postres', quantity: 1, lineTotalCents: 0, isCourtesy: true, courtesySource: 'grant' },
    ] },
  ],
  totalOrders: 2,
  page: 1,
  pageCount: 1,
  generatedAt: new Date('2026-10-15T16:30:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSalesReportAction).mockResolvedValue({ success: true, data: report });
  vi.mocked(voidOrderAction).mockResolvedValue({ success: true, data: { folio: 1 } });
});

describe('SalesDashboard', () => {
  it('por defecto consulta hoy (CDMX) y muestra totales, desglose y la hora de la consulta', async () => {
    render(<SalesDashboard today="2026-10-15" />);
    await waitFor(() => expect(getSalesReportAction).toHaveBeenCalledWith({ from: '2026-10-15', to: '2026-10-15', method: null, status: 'all', q: undefined, page: 1 }));
    expect(await screen.findByText('Última consulta: 10:30 A.M.')).toBeInTheDocument();
    const totals = within(screen.getByLabelText('Totales'));
    expect(totals.getByText('Total vendido').nextSibling).toHaveTextContent('$175.00');
    expect(totals.getByText('Cortesías (regalos)').nextSibling).toHaveTextContent('1');
    expect(within(screen.getByRole('region', { name: 'Desglose por producto' })).getByText('Latte (caliente)')).toBeInTheDocument();
  });

  it('cada cortesía indica su fuente', async () => {
    render(<SalesDashboard today="2026-10-15" />);
    const order = within(await screen.findByTestId('order-2'));
    expect(order.getByText('1× Latte — cortesía (cupo mensual)')).toBeInTheDocument();
    expect(order.getByText('1× Brownie — cortesía (regalo)')).toBeInTheDocument();
  });

  it('los filtros arman la consulta; la búsqueda se envía al buscar', async () => {
    render(<SalesDashboard today="2026-10-15" />);
    await screen.findByTestId('order-1');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Método'), { target: { value: 'transfer' } });
    fireEvent.change(screen.getByLabelText('Buscar folio, cliente o producto'), { target: { value: 'latte' } });
    const callsBeforeSearch = vi.mocked(getSalesReportAction).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(vi.mocked(getSalesReportAction).mock.calls.length).toBe(callsBeforeSearch + 1));
    expect(vi.mocked(getSalesReportAction).mock.calls.at(-1)![0]).toEqual({ from: '2026-10-01', to: '2026-10-15', method: 'transfer', status: 'all', q: 'latte', page: 1 });
  });

  describe('sin refresco automático', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it('pasar el tiempo no consulta; «Actualizar» sí, y se deshabilita mientras carga', async () => {
      render(<SalesDashboard today="2026-10-15" />);
      await screen.findByTestId('order-1');
      expect(getSalesReportAction).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(10 * 60 * 1000);
      });
      expect(getSalesReportAction).toHaveBeenCalledTimes(1);

      let resolve!: (value: Awaited<ReturnType<typeof getSalesReportAction>>) => void;
      vi.mocked(getSalesReportAction).mockReturnValueOnce(new Promise((r) => (resolve = r)));
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
      expect(await screen.findByRole('button', { name: 'Consultando…' })).toBeDisabled();
      await act(async () => resolve({ success: true, data: report }));
      expect(getSalesReportAction).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'Actualizar' })).toBeEnabled();
    });
  });

  it('anular: modal con folio, total y motivo obligatorio; no aparece en pedidos con corte', async () => {
    render(<SalesDashboard today="2026-10-15" />);
    expect(within(await screen.findByTestId('order-2')).queryByRole('button', { name: 'Anular' })).toBeNull();
    fireEvent.click(within(screen.getByTestId('order-1')).getByRole('button', { name: 'Anular' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Anular pedido #1');
    expect(dialog).toHaveTextContent('$130.00');
    expect(within(dialog).getByRole('button', { name: 'Sí, anular' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo (obligatorio)'), { target: { value: 'Cobro duplicado' } });
    expect(voidOrderAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, anular' }));
    await waitFor(() => expect(voidOrderAction).toHaveBeenCalledWith({ orderId: 'o1', reason: 'Cobro duplicado' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Pedido #1 anulado.');
  });
});
