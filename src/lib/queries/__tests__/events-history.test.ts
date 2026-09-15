import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      specialEvents: { findMany: vi.fn() },
    },
  },
}));

import { db } from '@/db';
import { getSpecialEventsHistory } from '../events';

/** Chainable query-builder mock: every builder method returns the chain and awaiting it resolves `result`. */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy'] as const) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

const event = {
  id: 'e1',
  title: 'Evento Uno',
  startDate: new Date('2030-09-16T00:00:00Z'),
  endDate: new Date('2030-09-16T06:00:00Z'),
  status: 'completed' as const,
  showOnLanding: true,
  price: 500,
};

describe('getSpecialEventsHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty array when there are no events', async () => {
    vi.mocked(db.query.specialEvents.findMany).mockResolvedValueOnce([] as never);
    expect(await getSpecialEventsHistory()).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('preserves the descending order returned by the database', async () => {
    const events = [
      { ...event, id: 'e2', title: 'Reciente' },
      { ...event, id: 'e1', title: 'Antiguo' },
    ];
    vi.mocked(db.query.specialEvents.findMany).mockResolvedValueOnce(events as never);
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(makeChain([])) // classes
      .mockReturnValueOnce(makeChain([])) // registrations
      .mockReturnValueOnce(makeChain([])); // guests

    const result = await getSpecialEventsHistory();
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('counts confirmed registrations and revenue only for confirmed status', async () => {
    vi.mocked(db.query.specialEvents.findMany).mockResolvedValueOnce([event] as never);

    const classes = [
      {
        id: 'c1',
        specialEventId: 'e1',
        classType: 'yoga',
        customName: null,
        classDate: new Date('2030-09-16T01:00:00Z'),
        capacity: 10,
        coachName: 'Coach Uno',
      },
    ];
    const registrations = [
      {
        id: 'r1',
        specialEventId: 'e1',
        openClassId: 'c1',
        status: 'confirmed',
        amountPaid: 300,
        createdAt: new Date('2030-09-01T12:00:00Z'),
        paymentType: 'transfer',
        userName: 'Ana',
        userEmail: 'ana@test.com',
      },
      {
        id: 'r2',
        specialEventId: 'e1',
        openClassId: 'c1',
        status: 'pending',
        amountPaid: 500,
        createdAt: new Date('2030-09-02T12:00:00Z'),
        paymentType: 'cash',
        userName: 'Beto',
        userEmail: 'beto@test.com',
      },
      {
        id: 'r3',
        specialEventId: 'e1',
        openClassId: 'c1',
        status: 'refunded',
        amountPaid: 500,
        createdAt: new Date('2030-09-03T12:00:00Z'),
        paymentType: 'cash',
        userName: 'Carla',
        userEmail: 'carla@test.com',
      },
    ];
    const guests = [
      {
        id: 'g1',
        openClassId: 'c1',
        guestName: 'Invitada Uno',
        origin: 'admin',
        status: 'pending',
        registeredByName: 'Admin',
      },
    ];

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(makeChain(classes))
      .mockReturnValueOnce(makeChain(registrations))
      .mockReturnValueOnce(makeChain(guests));

    const [result] = await getSpecialEventsHistory();

    expect(result.confirmedCount).toBe(1);
    expect(result.revenue).toBe(300);
    expect(result.classCount).toBe(1);
    expect(result.classes[0].registrations).toHaveLength(3);
    expect(result.classes[0].guests).toHaveLength(1);
    expect(result.classes[0].guests[0].guestName).toBe('Invitada Uno');
  });

  it('serializes dates as ISO strings', async () => {
    vi.mocked(db.query.specialEvents.findMany).mockResolvedValueOnce([event] as never);
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));

    const [result] = await getSpecialEventsHistory();
    expect(result.startDate).toBe('2030-09-16T00:00:00.000Z');
  });
});
