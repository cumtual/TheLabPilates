import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/users/u-1',
}));

import { ClientHistory } from '../ClientHistory';

/** D5: el historial del cliente en admin muestra fecha de reserva y de cancelación. */

const baseProps = {
  clientName: 'Ana',
  clientEmail: 'ana@test.com',
  metrics: { totalAttended: 0, totalAbsences: 0, totalLateCancellations: 1 },
  subscriptions: [],
  payments: [],
};

const attendance = [
  {
    id: 'e-1',
    classType: 'mat_pilates',
    customName: null,
    classDate: '25/09/2026',
    status: 'late_cancelled',
    bookedAt: '24/09/2026, 09:00 AM',
    cancelledAt: '24/09/2026, 10:15 AM',
  },
  {
    id: 'e-2',
    classType: 'mat_pilates',
    customName: null,
    classDate: '26/09/2026',
    status: 'pending',
    bookedAt: '24/09/2026, 11:00 AM',
    cancelledAt: null,
  },
];

describe('ClientHistory — auditoría de reservas', () => {
  it('muestra reserva y cancelación en inscripciones canceladas', () => {
    render(<ClientHistory {...baseProps} attendance={attendance} />);
    const row = screen.getByTestId('attendance-e-1');
    expect(within(row).getByText('Reservó: 24/09/2026, 09:00 AM')).toBeInTheDocument();
    expect(within(row).getByText('Canceló: 24/09/2026, 10:15 AM')).toBeInTheDocument();
  });

  it('una inscripción activa muestra solo la reserva', () => {
    render(<ClientHistory {...baseProps} attendance={attendance} />);
    const row = screen.getByTestId('attendance-e-2');
    expect(within(row).getByText('Reservó: 24/09/2026, 11:00 AM')).toBeInTheDocument();
    expect(within(row).queryByText(/Canceló/)).not.toBeInTheDocument();
  });
});
