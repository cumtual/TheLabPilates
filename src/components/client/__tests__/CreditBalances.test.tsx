import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CreditBalances } from '../CreditBalances';

/** Desglose de créditos en el dashboard (SPEC-SPECIAL-PACKAGES §8.1). */

const balances = [
  { balanceId: 'A', label: 'Yoga', remaining: 1, total: 1, timeWindow: '07:00–11:00', summary: '1 clase de Yoga', exhausted: false },
  { balanceId: 'B', label: 'Mat Pilates / Barre', remaining: 0, total: 1, timeWindow: null, summary: '0 clases de Mat Pilates / Barre', exhausted: true },
];

describe('CreditBalances', () => {
  it('encabezado con paquete, vencimiento y total; una fila por grupo', () => {
    render(<CreditBalances packageName="Reset Pass" expirationDate="21/10/2026" totalRemaining={1} balances={balances} guestCredits={null} />);

    expect(screen.getByRole('heading', { name: 'Tus créditos' })).toBeInTheDocument();
    expect(screen.getByText('Reset Pass · Vence 21/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Te queda 1 clase')).toBeInTheDocument();

    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('1 clase de Yoga')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Solo de 07:00 a 11:00')).toBeInTheDocument();
  });

  it('un grupo usado aparece atenuado como «0 de 1» y «Usada»', () => {
    render(<CreditBalances packageName="Reset Pass" expirationDate="21/10/2026" totalRemaining={1} balances={balances} guestCredits={null} />);
    const used = screen.getAllByRole('listitem')[1];
    expect(within(used).getByText('0 de 1 · Mat Pilates / Barre')).toBeInTheDocument();
    expect(within(used).getByText('Usada')).toBeInTheDocument();
    expect(used.className).toContain('opacity-60');
  });

  it('con el Reset Pass sin usar muestra ambos grupos y el plural', () => {
    render(
      <CreditBalances
        packageName="Reset Pass"
        expirationDate="21/10/2026"
        totalRemaining={2}
        balances={[balances[0], { ...balances[1], remaining: 1, exhausted: false, summary: '1 clase de Mat Pilates / Barre' }]}
        guestCredits={null}
      />
    );
    expect(screen.getByText('Te quedan 2 clases')).toBeInTheDocument();
    expect(screen.getByText('1 clase de Mat Pilates / Barre')).toBeInTheDocument();
  });

  it('muestra los pases de invitado cuando el paquete los incluye', () => {
    render(<CreditBalances packageName="Reset Pass" expirationDate="21/10/2026" totalRemaining={1} balances={balances} guestCredits={{ available: 1, total: 2 }} />);
    expect(screen.getByText('1 de 2 pases de invitado')).toBeInTheDocument();
  });
});
