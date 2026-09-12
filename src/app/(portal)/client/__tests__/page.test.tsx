import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import ClientDashboardPage from '../page';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Chainable query-builder mock. Awaiting the chain resolves to `result`.
 * Supports the dashboard chains ending in `.limit()`.
 */
function makeChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit'] as const) {
    chain[method].mockReturnValue(chain);
  }
  return chain;
}

function mockDashboardQuery(userSub: Record<string, unknown>) {
  // 1st select: subscription state. 2nd select: next class (none).
  (db.select as ReturnType<typeof vi.fn>)
    .mockReturnValueOnce(
      makeChain([
        {
          userSub,
          payment: { confirmed: true },
          subscription: { guest: false },
        },
      ])
    )
    .mockReturnValueOnce(makeChain([]));
}

describe('ClientDashboardPage — expired vs suspended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'user-uuid',
      role: 'client',
      email: 'client@test.com',
    });
  });

  it('shows the expired state (never suspended) for an expired subscription', async () => {
    mockDashboardQuery({
      id: 'sub-1',
      active: false,
      status: 'expired',
      daysRemaining: 0,
      expirationDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    render(await ClientDashboardPage());

    expect(screen.getByText('Expirada')).toBeInTheDocument();
    expect(screen.queryByText('Suscripción Suspendida')).toBeNull();
  });

  it('shows the suspended state only for an explicitly suspended subscription', async () => {
    mockDashboardQuery({
      id: 'sub-2',
      active: false,
      status: 'suspended',
      daysRemaining: 0,
      expirationDate: null,
    });

    render(await ClientDashboardPage());

    expect(screen.getByText('Suscripción Suspendida')).toBeInTheDocument();
    expect(screen.queryByText('Expirada')).toBeNull();
  });
});
