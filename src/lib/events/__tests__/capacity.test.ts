import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      openClasses: { findFirst: vi.fn() },
      specialEventDiscounts: { findFirst: vi.fn() },
    },
  },
}));

import { db } from '@/db';
import {
  getEventClassOccupied,
  getEventClassAvailable,
  computeEventPrice,
} from '../capacity';

/** Mocks the two `select().from().where()` count queries of getEventClassOccupied. */
function mockOccupiedQueries(confirmed: number, guests: number) {
  let callIndex = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: () => ({
      where: () => {
        const result = callIndex === 0 ? [{ count: confirmed }] : [{ count: guests }];
        callIndex++;
        return Promise.resolve(result);
      },
    }),
  }));
}

describe('getEventClassOccupied', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums confirmed registrations + active guests', async () => {
    mockOccupiedQueries(3, 2);
    expect(await getEventClassOccupied('class-1')).toBe(5);
  });

  it('returns 0 when there are no occupants', async () => {
    mockOccupiedQueries(0, 0);
    expect(await getEventClassOccupied('class-1')).toBe(0);
  });
});

describe('getEventClassAvailable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 0 when the class does not exist', async () => {
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    expect(await getEventClassAvailable('missing')).toBe(0);
  });

  it('returns capacity - confirmed - guests', async () => {
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'class-1',
      capacity: 10,
    });
    mockOccupiedQueries(4, 1);
    expect(await getEventClassAvailable('class-1')).toBe(5);
  });

  it('never returns a negative number', async () => {
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'class-1',
      capacity: 2,
    });
    mockOccupiedQueries(5, 0);
    expect(await getEventClassAvailable('class-1')).toBe(0);
  });
});

describe('computeEventPrice', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockActiveSubs(rows: { subscriptionId: string }[]) {
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(rows),
          }),
        }),
      }),
    }));
  }

  it('applies the membership discount when configured', async () => {
    mockActiveSubs([{ subscriptionId: 'plan-open-lab' }]);
    (db.query.specialEventDiscounts.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      discountAmount: 200,
    });

    expect(await computeEventPrice({ id: 'event-1', price: 500 }, 'user-1')).toBe(300);
  });

  it('charges the base price when the user has no active subscription', async () => {
    mockActiveSubs([]);
    expect(await computeEventPrice({ id: 'event-1', price: 500 }, 'user-1')).toBe(500);
  });

  it('never goes below zero when the discount exceeds the price', async () => {
    mockActiveSubs([{ subscriptionId: 'plan-open-lab' }]);
    (db.query.specialEventDiscounts.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      discountAmount: 900,
    });

    expect(await computeEventPrice({ id: 'event-1', price: 500 }, 'user-1')).toBe(0);
  });
});
