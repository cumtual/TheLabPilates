import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/** Ajustes manuales por grupo en suscripciones especiales (SPEC-SPECIAL-PACKAGES §7.4, D5). */

vi.mock('@/actions/admin', () => ({
  suspendSubscriptionAction: vi.fn(),
  reactivateSubscriptionAction: vi.fn(),
  refundSessionCreditAction: vi.fn(),
  decrementSubscriptionCreditAction: vi.fn(),
  getSubscriptionEnrollmentsAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/subscriptions',
}));

import { SubscriptionManagement } from '../SubscriptionManagement';
import { decrementSubscriptionCreditAction, refundSessionCreditAction } from '@/actions/admin';

const base = {
  userId: 'user-1', clientName: 'Ana', clientEmail: 'ana@test.com', subscriptionName: 'Reset Pass', daysRemaining: 1,
  expirationDate: '21/10/2026', active: true, status: 'active' as const, isOpenLab: false,
};

const special = {
  ...base,
  subscriptionId: 'us-1',
  balances: [
    { balanceId: 'A', label: 'Yoga', remaining: 1, total: 1, timeWindow: '07:00–11:00', summary: '1 clase de Yoga', exhausted: false },
    { balanceId: 'B', label: 'Mat Pilates / Barre', remaining: 0, total: 1, timeWindow: null, summary: '0 clases de Mat Pilates / Barre', exhausted: true },
  ],
};

function renderWith(subscriptions: (typeof special | (typeof base & { subscriptionId: string }))[]) {
  render(
    <SubscriptionManagement
      subscriptions={subscriptions}
      totalPages={1}
      currentPage={1}
      currentFilter="all"
      currentSearch=""
      statusCounts={{ all: 1, active: 1, suspended: 0, expired: 0 }}
    />
  );
}

beforeEach(() => vi.clearAllMocks());

describe('SubscriptionManagement — paquetes especiales', () => {
  it('muestra el saldo de cada grupo', () => {
    renderWith([special]);
    const groups = within(screen.getByRole('list', { name: 'Créditos por grupo de Ana' }));
    expect(groups.getByText('Yoga: 1/1 · 07:00–11:00')).toBeInTheDocument();
    expect(groups.getByText('Mat Pilates / Barre: 0/1')).toBeInTheDocument();
  });

  it('+1 pide el grupo, deshabilita los llenos y envía balanceId', async () => {
    vi.mocked(refundSessionCreditAction).mockResolvedValue({ success: true, message: 'Crédito de sesión otorgado.' });
    renderWith([special]);

    fireEvent.click(screen.getByRole('button', { name: 'Otorgar Crédito' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Yoga (1/1)')).toBeDisabled();

    fireEvent.click(dialog.getByRole('button', { name: 'Sí, otorgar crédito' }));
    expect(await screen.findByText('Selecciona el grupo de créditos.')).toBeInTheDocument();
    expect(refundSessionCreditAction).not.toHaveBeenCalled();

    fireEvent.click(dialog.getByLabelText('Mat Pilates / Barre (0/1)'));
    fireEvent.click(dialog.getByRole('button', { name: 'Sí, otorgar crédito' }));
    await waitFor(() => expect(refundSessionCreditAction).toHaveBeenCalledWith('user-1', 'B'));
    expect(await screen.findByText('Mat Pilates / Barre: 1/1')).toBeInTheDocument();
  });

  it('−1 deshabilita los grupos vacíos y envía balanceId', async () => {
    vi.mocked(decrementSubscriptionCreditAction).mockResolvedValue({ success: true, message: 'Crédito descontado.', data: { daysRemaining: 0, expired: true } });
    renderWith([special]);

    fireEvent.click(screen.getByRole('button', { name: 'Descontar Crédito' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Mat Pilates / Barre (0/1)')).toBeDisabled();
    fireEvent.click(dialog.getByLabelText('Yoga (1/1)'));
    fireEvent.click(dialog.getByRole('button', { name: 'Sí, descontar' }));

    await waitFor(() => expect(decrementSubscriptionCreditAction).toHaveBeenCalledWith('us-1', 'A'));
  });

  it('estándar: sin selector y sin balanceId', async () => {
    vi.mocked(refundSessionCreditAction).mockResolvedValue({ success: true, message: 'ok' });
    renderWith([{ ...base, subscriptionId: 'us-2' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Otorgar Crédito' }));
    expect(screen.queryByText('Grupo de créditos')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, otorgar crédito' }));
    await waitFor(() => expect(refundSessionCreditAction).toHaveBeenCalledWith('user-1', undefined));
  });
});
