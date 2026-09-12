import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    query: {
      userSubscriptions: { findMany: vi.fn() },
      subscriptions: { findMany: vi.fn(), findFirst: vi.fn() },
      payments: { findFirst: vi.fn() },
      debitCards: { findFirst: vi.fn() },
    },
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// The packages grid renders this client component (server action deps); not relevant here.
vi.mock('@/components/client/SubscriptionCard', () => ({
  SubscriptionCard: () => null,
}));

import SubscriptionPage from '../page';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

describe('Client subscription page — suspended banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'user-uuid',
      role: 'client',
      email: 'client@test.com',
    });
    (db.query.debitCards.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.query.subscriptions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('does NOT show the suspended banner for an expired subscription', async () => {
    (db.query.userSubscriptions.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'sub-expired',
        paymentId: 'pay-expired',
        subscriptionId: 'plan-1',
        userId: 'user-uuid',
        active: false,
        status: 'expired',
        daysRemaining: 0,
        expirationDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ]);
    // No unconfirmed payment
    (db.query.payments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const ui = await SubscriptionPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.queryByText('Tienes una suscripción suspendida')).toBeNull();
  });

  it('shows the suspended banner for an admin-suspended subscription', async () => {
    (db.query.userSubscriptions.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'sub-suspended',
        paymentId: 'pay-suspended',
        subscriptionId: 'plan-1',
        userId: 'user-uuid',
        active: false,
        status: 'suspended',
        daysRemaining: 0,
        expirationDate: null,
      },
    ]);
    // First call: unconfirmed payment check → none. Second: confirmed payment check → yes.
    (db.query.payments.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'pay-suspended', confirmed: true });

    const ui = await SubscriptionPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByText('Tienes una suscripción suspendida')).toBeInTheDocument();
  });
});
