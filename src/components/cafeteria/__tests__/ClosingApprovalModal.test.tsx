import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ClosingDetail } from '@/modules/cafeteria/presentation/types';

vi.mock('@/modules/cafeteria/presentation/actions/admin', () => ({ resolveClosingAction: vi.fn() }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { resolveClosingAction } from '@/modules/cafeteria/presentation/actions/admin';
import { PendingClosingAlert } from '../PendingClosingAlert';

/** Aprobación del corte (SPEC-CAFETERIA D6, TASK-CF-ADM-01, TASK-CF-ADM-06). */

const closing = (overrides: Partial<ClosingDetail> = {}): ClosingDetail => ({
  id: 'c1', createdBy: 'b1', createdByName: 'Beto Barra', resolvedByName: null,
  periodStart: new Date('2026-10-15T14:05:00Z'), periodEnd: new Date('2026-10-15T23:30:00Z'), status: 'pending',
  ordersCount: 12, cashOrdersCount: 8, transferOrdersCount: 3, courtesyItemsCount: 2, courtesyValueCents: 13000,
  cashTotalCents: 84000, transferTotalCents: 25500, cashDeliveredCents: 83500, deliveryNote: 'Cambio a cliente',
  resolvedBy: null, resolvedAt: null, cashReceivedCents: null, shortfallCents: null, resolutionNote: null,
  createdEmailStatus: 'sent', createdEmailSentAt: null, resolvedEmailStatus: null, resolvedEmailSentAt: null, createdAt: new Date('2026-10-16T00:15:00Z'),
  breakdown: [{ group: 'Bebidas › Café', productName: 'Latte', temperature: 'hot', soldQuantity: 10, revenueCents: 65000, courtesyMonthly: 2, courtesyGrant: 0, courtesyValueCents: 13000 }],
  transfers: [{ folio: 41, totalCents: 25500, createdAt: new Date('2026-10-15T20:00:00Z') }],
  discountCents: 0,
  ...overrides,
});

const dialog = () => screen.getByRole('dialog');
const click = (name: string | RegExp) => fireEvent.click(within(dialog()).getByRole('button', { name }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveClosingAction).mockResolvedValue({ success: true, data: { status: 'approved', emailSent: true }, message: 'Corte cerrado.' });
});

describe('PendingClosingAlert', () => {
  it('sin cortes pendientes no aparece; con varios muestra la cantidad', () => {
    const { container, unmount } = render(<PendingClosingAlert closings={[]} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    render(<PendingClosingAlert closings={[closing(), closing({ id: 'c2' })]} />);
    expect(screen.getByText('Tienes 2 cortes de caja pendientes')).toBeInTheDocument();
  });

  it('abre el modal con periodo, barra, pedidos, efectivo cobrado y entregado, diferencia, transferencias y cortesías', () => {
    render(<PendingClosingAlert closings={[closing()]} />);
    expect(screen.getByText('Tienes un corte de caja pendiente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Revisar/ }));
    for (const text of ['15/10/2026, 08:05 AM', 'Beto Barra', '12', '$840.00', '$835.00', 'Diferencia declarada', '$5.00', 'Cambio a cliente', 'Transferencias (3)', '$255.00', 'Cortesías (2)', '$130.00', '#41']) {
      expect(dialog()).toHaveTextContent(text);
    }
  });
});

describe('ClosingApprovalModal', () => {
  it('«Recibí el efectivo completo» pide confirmación y llama con received_all', async () => {
    render(<PendingClosingAlert closings={[closing()]} />);
    fireEvent.click(screen.getByRole('button', { name: /Revisar/ }));
    click('Recibí el efectivo completo');
    expect(resolveClosingAction).not.toHaveBeenCalled();
    expect(dialog()).toHaveTextContent('Confirmas que recibiste $835.00');
    click('Sí, recibí completo');
    await waitFor(() => expect(resolveClosingAction).toHaveBeenCalledWith({ closingId: 'c1', outcome: 'received_all' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Corte cerrado.');
    expect(refresh).toHaveBeenCalled();
  });

  it('«No lo recibí completo»: faltante en vivo, nota obligatoria, rechaza ≥ entregado y confirma antes de llamar', async () => {
    render(<PendingClosingAlert closings={[closing()]} />);
    fireEvent.click(screen.getByRole('button', { name: /Revisar/ }));
    click('No lo recibí completo');
    const continuar = () => within(dialog()).getByRole('button', { name: 'Continuar' });

    fireEvent.change(screen.getByLabelText('Efectivo que recibiste'), { target: { value: '835' } });
    expect(dialog()).toHaveTextContent('usa «Recibí el efectivo completo»');
    expect(continuar()).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Efectivo que recibiste'), { target: { value: '800.50' } });
    expect(screen.getByTestId('shortfall')).toHaveTextContent('Faltante: $34.50');
    expect(continuar()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nota (obligatoria)'), { target: { value: 'Faltó un billete' } });
    expect(continuar()).toBeEnabled();

    click('Continuar');
    expect(resolveClosingAction).not.toHaveBeenCalled();
    expect(dialog()).toHaveTextContent('Recibido: $800.50 · Faltante: $34.50');
    click('Sí, cerrar con faltante');
    await waitFor(() =>
      expect(resolveClosingAction).toHaveBeenCalledWith({ closingId: 'c1', outcome: 'received_partial', cashReceived: '800.50', note: 'Faltó un billete' })
    );
  });

  it('cerrar no llama a nada', () => {
    render(<PendingClosingAlert closings={[closing()]} />);
    fireEvent.click(screen.getByRole('button', { name: /Revisar/ }));
    click('Cerrar');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(resolveClosingAction).not.toHaveBeenCalled();
  });
});
