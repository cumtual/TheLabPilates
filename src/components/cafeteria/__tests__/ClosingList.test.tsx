import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ClosingView } from '@/modules/cafeteria/presentation/types';

vi.mock('@/modules/cafeteria/presentation/actions/admin', () => ({ retryClosingEmailAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { retryClosingEmailAction } from '@/modules/cafeteria/presentation/actions/admin';
import { ClosingList } from '../ClosingList';

const base: ClosingView = {
  id: 'c1', createdBy: 'b', createdByName: 'Beto', resolvedByName: 'Admin', periodStart: new Date(), periodEnd: new Date(), status: 'approved_with_shortfall',
  ordersCount: 3, cashOrdersCount: 2, transferOrdersCount: 1, courtesyItemsCount: 0, courtesyValueCents: 0, cashTotalCents: 10000, transferTotalCents: 500,
  cashDeliveredCents: 10000, deliveryNote: null, resolvedBy: 'a', resolvedAt: new Date(), cashReceivedCents: 9500, shortfallCents: 500, resolutionNote: 'x',
  createdEmailStatus: 'sent', createdEmailSentAt: null, resolvedEmailStatus: 'failed', resolvedEmailSentAt: null, createdAt: new Date('2026-10-15T20:00:00Z'),
};

/** Historial de cortes (TASK-CF-ADM-06). */
describe('ClosingList', () => {
  it('marca el faltante y el correo fallido con «Reintentar» (sin confirmación)', async () => {
    vi.mocked(retryClosingEmailAction).mockResolvedValue({ success: true, data: { emailSent: true } });
    render(<ClosingList closings={[base, { ...base, id: 'c2', status: 'approved', shortfallCents: 0, resolvedEmailStatus: 'sent' }]} />);
    const first = within(screen.getByTestId('closing-c1'));
    expect(first.getByText('Faltante $5.00')).toBeInTheDocument();
    expect(first.getByText('Correo de cierre no enviado')).toBeInTheDocument();
    expect(within(screen.getByTestId('closing-c2')).queryByRole('button', { name: 'Reintentar' })).toBeNull();
    fireEvent.click(first.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(retryClosingEmailAction).toHaveBeenCalledWith({ closingId: 'c1', which: 'resolved' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Correo enviado.');
  });
});
