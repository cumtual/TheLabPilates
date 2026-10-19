import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expectConfirmBeforeAction } from '@/test-utils/confirm';

vi.mock('@/actions/debit-cards', () => ({
  addDebitCardAction: vi.fn(),
  activateDebitCardAction: vi.fn(),
  deactivateDebitCardAction: vi.fn(),
  deleteDebitCardAction: vi.fn(),
  setBarBankAccountAction: vi.fn(),
}));

import { activateDebitCardAction, setBarBankAccountAction } from '@/actions/debit-cards';
import { DebitCardManagement } from '../DebitCardManagement';

/** Cuenta de la barra (SPEC-CAFETERIA A6, TASK-CF-ADM-04). */

const cards = [
  { id: 'c1', cardName: 'The Lab', cardNumber: '0123', cardBank: 'BBVA', active: true, barActive: false },
  { id: 'c2', cardName: 'Luis', cardNumber: '9876', cardBank: 'Banorte', active: false, barActive: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setBarBankAccountAction).mockResolvedValue({ success: true, message: 'Cuenta marcada para la barra.' });
});

describe('DebitCardManagement — barra', () => {
  it('marca la cuenta de barra con confirmación; mueve la marca y no toca la activa', async () => {
    render(<DebitCardManagement cards={cards} />);
    expect(screen.getByText('Barra')).toBeInTheDocument();
    const usar = () => screen.getByRole('button', { name: 'Usar en la barra' });
    fireEvent.click(usar());
    expect(screen.getByRole('dialog')).toHaveTextContent('BBVA · The Lab · 0123');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await expectConfirmBeforeAction({ trigger: () => fireEvent.click(usar()), action: vi.mocked(setBarBankAccountAction), confirmLabel: 'Sí, usar en la barra' });
    expect(setBarBankAccountAction).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Quitar de la barra' })).toHaveLength(1));
    expect(activateDebitCardAction).not.toHaveBeenCalled();
  });

  it('quitar la marca también confirma', async () => {
    render(<DebitCardManagement cards={cards} />);
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Quitar de la barra' })),
      action: vi.mocked(setBarBankAccountAction),
      confirmLabel: 'Sí, quitar',
    });
    expect(setBarBankAccountAction).toHaveBeenCalledWith(null);
  });
});
