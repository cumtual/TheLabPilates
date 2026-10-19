import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { OpenShift } from '@/modules/cafeteria/presentation/types';
import { expectConfirmBeforeAction } from '@/test-utils/confirm';

vi.mock('@/modules/cafeteria/presentation/actions/register', () => ({ createClosingAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { createClosingAction } from '@/modules/cafeteria/presentation/actions/register';
import { ClosingForm } from '../ClosingForm';

/** Corte de la barra (SPEC-CAFETERIA D6, A3, TASK-CF-BAR-04). */

const shift = (overrides: Partial<OpenShift> = {}): OpenShift => ({
  orders: [
    { id: 'o1', folio: 1, createdAt: new Date('2026-10-15T15:00:00Z'), customerLabel: null, paymentMethod: 'cash', totalCents: 8400, courtesyItems: 0, itemsLabel: '2× Latte' },
    { id: 'o2', folio: 2, createdAt: new Date('2026-10-15T16:00:00Z'), customerLabel: null, paymentMethod: 'transfer', totalCents: 4500, courtesyItems: 0, itemsLabel: 'Brownie' },
  ],
  totals: {
    ordersCount: 2, cashOrdersCount: 1, transferOrdersCount: 1, cashTotalCents: 8400, transferTotalCents: 4500,
    courtesyItemsCount: 0, courtesyValueCents: 0, periodStart: new Date('2026-10-15T15:00:00Z'), periodEnd: new Date('2026-10-15T16:00:00Z'),
  },
  pendingClosings: 0,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClosingAction).mockResolvedValue({ success: true, data: { closingId: 'c1', emailSent: true } });
});

describe('ClosingForm', () => {
  it('lista los pedidos y los totales con las transferencias aparte; el entregado por defecto es lo cobrado', () => {
    render(<ClosingForm shift={shift()} />);
    expect(screen.getByText('Efectivo cobrado').nextSibling).toHaveTextContent('$84.00');
    expect(screen.getByText('Transferencias (1)').nextSibling).toHaveTextContent('$45.00');
    expect(screen.getByLabelText('Efectivo que entrego')).toHaveValue('84.00');
    expect(within(screen.getByRole('region', { name: 'Pedidos del turno' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('«Hacer corte» pide confirmación con cobrado, entregado, diferencia y pedidos; envía los totales vistos', async () => {
    render(<ClosingForm shift={shift()} />);
    fireEvent.change(screen.getByLabelText('Efectivo que entrego'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Motivo de la diferencia'), { target: { value: 'Compré hielo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hacer corte' }));
    const dialog = screen.getByRole('dialog');
    for (const text of ['$84.00', '$80.00', '$4.00', '2']) expect(dialog).toHaveTextContent(text);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Hacer corte' })),
      action: vi.mocked(createClosingAction),
      confirmLabel: 'Sí, hacer corte',
    });
    expect(createClosingAction).toHaveBeenCalledWith({ cashDelivered: '80', deliveryNote: 'Compré hielo', expectedOrdersCount: 2, expectedCashTotalCents: 8400 });
  });

  it('menos de lo cobrado exige la nota; más de lo cobrado → error; no abre el modal', () => {
    render(<ClosingForm shift={shift()} />);
    fireEvent.change(screen.getByLabelText('Efectivo que entrego'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hacer corte' }));
    expect(screen.getByText('Explica por qué entregas menos de lo cobrado.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Efectivo que entrego'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hacer corte' }));
    expect(screen.getByText(/No puedes entregar más de lo cobrado/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sin pedidos el botón está deshabilitado; avisa si hay un corte anterior pendiente', () => {
    render(<ClosingForm shift={shift({ orders: [], totals: { ...shift().totals, ordersCount: 0, cashTotalCents: 0 }, pendingClosings: 1 })} />);
    expect(screen.getByRole('button', { name: 'Hacer corte' })).toBeDisabled();
    expect(screen.getByText(/un corte anterior pendiente/)).toBeInTheDocument();
  });
});
