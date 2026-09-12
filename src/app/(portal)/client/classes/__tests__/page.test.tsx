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
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/client/classes',
}));

// Avoid rendering the client guest section (server actions / router).
vi.mock('@/components/client/EnrollWithGuestSection', () => ({
  EnrollWithGuestSection: () => null,
}));

import ClientClassesPage from '../page';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Builds a chainable query-builder mock. Awaiting the chain resolves to `result`.
 * Supports: select().from().leftJoin()...orderBy() and select().from().where()...groupBy().
 */
function makeChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.groupBy.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  return chain;
}

describe('ClientClassesPage — combined capacity count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows holder + guest count (2/10) instead of only the holder count', async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'user-uuid',
      role: 'client',
      email: 'client@test.com',
    });

    const allClasses = [
      {
        id: 'c1',
        classDate: new Date('2025-12-01T10:00:00Z'),
        classType: 'yoga',
        customName: null,
        capacity: 10,
        coachUserId: 'coach-uuid',
        coachName: 'Coach',
        enrolledCount: 1,
      },
    ];
    const guestCounts = [{ classId: 'c1', cnt: 1 }];

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(makeChain(allClasses))
      .mockReturnValueOnce(makeChain(guestCounts));

    const ui = await ClientClassesPage({
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByText('Capacidad: 2/10')).toBeInTheDocument();
  });
});
