import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

/** Tarjeta de la tienda con paquetes especiales (SPEC-SPECIAL-PACKAGES §8.2). */

vi.mock('@/actions/subscription', () => ({ purchaseSubscriptionAction: vi.fn() }));

import { SubscriptionCard } from '../SubscriptionCard';

describe('SubscriptionCard', () => {
  it('un especial muestra desglose, vigencia y pases de invitado', () => {
    render(
      <SubscriptionCard
        hasPendingPayment={false}
        pkg={{
          id: 'p', name: 'Reset Pass', sessions: 2, guest: false, price: 179, shortDescription: 'Un respiro.',
          breakdown: ['1 clase de Yoga · 07:00–11:00', '1 clase de Mat Pilates / Barre'],
          validityLabel: 'Vigencia: 2 semanas', guestBadge: '+2 Invitados',
        }}
      />
    );
    const includes = within(screen.getByRole('list', { name: 'Incluye' }));
    expect(includes.getByText('1 clase de Yoga · 07:00–11:00')).toBeInTheDocument();
    expect(includes.getByText('1 clase de Mat Pilates / Barre')).toBeInTheDocument();
    expect(screen.getByText('Vigencia: 2 semanas')).toBeInTheDocument();
    expect(screen.getByText('+2 Invitados')).toBeInTheDocument();
  });

  it('un estándar se ve como antes', () => {
    render(<SubscriptionCard hasPendingPayment={false} pkg={{ id: 'p', name: 'Lab Entry', sessions: 4, guest: false, price: 360 }} />);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Incluye' })).not.toBeInTheDocument();
  });
});
