import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      specialEvents: { findFirst: vi.fn() },
      specialEventRegistrations: { findFirst: vi.fn() },
    },
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/lib/queries/next-class', () => ({
  getNextClassWithCheckin: vi.fn(),
}));

vi.mock('@/lib/queries/pending-transfers', () => ({
  getPendingTransferPayments: vi.fn().mockResolvedValue([]),
}));

import ClientDashboardPage from '../page';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { getNextClassWithCheckin } from '@/lib/queries/next-class';

const mockedNextClass = getNextClassWithCheckin as ReturnType<typeof vi.fn>;

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
  // Subscription state query (the next class comes from getNextClassWithCheckin).
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
    makeChain([
      {
        userSub,
        payment: { confirmed: true },
        subscription: { guest: false },
      },
    ])
  );
}

describe('ClientDashboardPage — expired vs suspended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'user-uuid',
      role: 'client',
      email: 'client@test.com',
    });
    mockedNextClass.mockResolvedValue(null);
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

describe('ClientDashboardPage — QR check-in on the next class', () => {
  const activeSub = {
    id: 'sub-3',
    active: true,
    status: 'active',
    daysRemaining: 5,
    expirationDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'user-uuid',
      role: 'client',
      email: 'client@test.com',
    });
  });

  function nextClass(checkin: { qrDataUrl: string } | null) {
    return {
      enrollmentId: 'enrollment-1',
      classDate: new Date(Date.now() + 60 * 60 * 1000),
      classType: 'mat_pilates',
      customName: null,
      coachName: 'Coach Ana',
      checkin,
    };
  }

  it('shows "Ver mi código QR" when the pending next class has a QR', async () => {
    mockDashboardQuery(activeSub);
    mockedNextClass.mockResolvedValue(nextClass({ qrDataUrl: 'data:image/svg+xml,%3Csvg%3E' }));

    render(await ClientDashboardPage());

    expect(screen.getByText('Tu próxima clase')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver mi código QR' })).toBeInTheDocument();
  });

  it('shows the next class without the QR button when no QR is available', async () => {
    mockDashboardQuery(activeSub);
    mockedNextClass.mockResolvedValue(nextClass(null));

    render(await ClientDashboardPage());

    expect(screen.getByText('Tu próxima clase')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver mi código QR' })).toBeNull();
  });

  it('shows no QR button without a next class', async () => {
    mockDashboardQuery(activeSub);
    mockedNextClass.mockResolvedValue(null);

    render(await ClientDashboardPage());

    expect(screen.queryByText('Tu próxima clase')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver mi código QR' })).toBeNull();
  });
});
