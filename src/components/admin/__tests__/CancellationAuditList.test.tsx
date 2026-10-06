import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CancellationAuditList } from '../CancellationAuditList';
import type { AdminEnrollmentAuditRow } from '@/lib/queries/admin-enrollment-audit';

const base = {
  kind: 'titular' as const,
  name: 'Ana Alumna',
  detail: 'ana@test.com',
  bookedAt: '24/09/2026, 09:00 AM',
};

const rows: AdminEnrollmentAuditRow[] = [
  { ...base, enrollmentId: 'e-1', status: 'late_cancelled', cancelledAt: '24/09/2026, 10:15 AM' },
  { ...base, enrollmentId: 'e-2', name: 'Beto', status: 'cancelled', cancelledAt: 'Sin registro' },
  {
    ...base,
    kind: 'guest',
    enrollmentId: 'g-1',
    name: 'Invitada',
    detail: 'Invitado de Ana',
    status: 'cancelled',
    cancelledAt: '24/09/2026, 11:00 AM',
  },
];

describe('CancellationAuditList', () => {
  it('muestra reserva, cancelación y badge de cada cancelación', () => {
    render(<CancellationAuditList rows={rows} />);

    expect(screen.getByRole('heading', { name: 'Cancelaciones (3)' })).toBeInTheDocument();
    const late = screen.getByTestId('cancellation-e-1');
    expect(within(late).getByText('Reservó: 24/09/2026, 09:00 AM')).toBeInTheDocument();
    expect(within(late).getByText('Canceló: 24/09/2026, 10:15 AM')).toBeInTheDocument();
    expect(within(late).getByText('Cancelación tardía')).toBeInTheDocument();
  });

  it('cancelación histórica sin timestamp → «Sin registro»', () => {
    render(<CancellationAuditList rows={rows} />);
    expect(within(screen.getByTestId('cancellation-e-2')).getByText('Canceló: Sin registro')).toBeInTheDocument();
  });

  it('identifica a los invitados', () => {
    render(<CancellationAuditList rows={rows} />);
    const guest = screen.getByTestId('cancellation-g-1');
    expect(within(guest).getByText('Invitado de Ana')).toBeInTheDocument();
    expect(within(guest).getByText('Invitado')).toBeInTheDocument();
  });

  it('ignora filas no canceladas y no renderiza nada si no hay cancelaciones', () => {
    const { container } = render(
      <CancellationAuditList rows={[{ ...base, enrollmentId: 'e-9', status: 'pending', cancelledAt: null }]} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
