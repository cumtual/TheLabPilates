import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    query: {
      specialEvents: { findFirst: vi.fn() },
      specialEventRegistrations: { findFirst: vi.fn() },
      openClasses: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/events/capacity', () => ({
  computeEventPrice: vi.fn(),
  getEventClassAvailable: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));

import { purchaseSpecialEventAction } from '../event';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { computeEventPrice, getEventClassAvailable } from '@/lib/events/capacity';

const clientSession = { sub: 'user-1', role: 'client', email: 'c@test.com' };

const activeEvent = { id: 'event-1', status: 'active', price: 500 };
const eventClass = { id: 'class-1', specialEventId: 'event-1', status: 'scheduled' };

function mockTx() {
  let insertCall = 0;
  const tx = {
    insert: vi.fn(() => {
      insertCall++;
      if (insertCall === 1) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'payment-1' }]),
          })),
        };
      }
      return { values: vi.fn(() => Promise.resolve()) };
    }),
  };
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(tx)
  );
  return tx;
}

describe('purchaseSpecialEventAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(clientSession as never);
    vi.mocked(computeEventPrice).mockResolvedValue(500);
    vi.mocked(getEventClassAvailable).mockResolvedValue(5);
  });

  it('rejects when the no-refund disclaimer is not accepted', async () => {
    const result = await purchaseSpecialEventAction('event-1', 'class-1', 'transfer', false);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/definitiva/i);
  });

  it('rejects when there is no session', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const result = await purchaseSpecialEventAction('event-1', 'class-1', 'cash', true);
    expect(result.success).toBe(false);
  });

  it('rejects a second purchase of the same event', async () => {
    vi.mocked(db.query.specialEvents.findFirst).mockResolvedValueOnce(activeEvent as never);
    vi.mocked(db.query.specialEventRegistrations.findFirst).mockResolvedValueOnce({
      id: 'existing-reg',
    } as never);

    const result = await purchaseSpecialEventAction('event-1', 'class-1', 'cash', true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/Ya adquiriste/i);
  });

  it('rejects a class that does not belong to the event', async () => {
    vi.mocked(db.query.specialEvents.findFirst).mockResolvedValueOnce(activeEvent as never);
    vi.mocked(db.query.specialEventRegistrations.findFirst).mockResolvedValueOnce(undefined as never);
    vi.mocked(db.query.openClasses.findFirst).mockResolvedValueOnce({
      id: 'class-1',
      specialEventId: 'other-event',
      status: 'scheduled',
    } as never);

    const result = await purchaseSpecialEventAction('event-1', 'class-1', 'cash', true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/no pertenece/i);
  });

  it('rejects a full class', async () => {
    vi.mocked(db.query.specialEvents.findFirst).mockResolvedValueOnce(activeEvent as never);
    vi.mocked(db.query.specialEventRegistrations.findFirst).mockResolvedValueOnce(undefined as never);
    vi.mocked(db.query.openClasses.findFirst).mockResolvedValueOnce(eventClass as never);
    vi.mocked(getEventClassAvailable).mockResolvedValueOnce(0);

    const result = await purchaseSpecialEventAction('event-1', 'class-1', 'cash', true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/llena/i);
  });

  it('creates a pending payment and registration on success', async () => {
    vi.mocked(db.query.specialEvents.findFirst).mockResolvedValueOnce(activeEvent as never);
    vi.mocked(db.query.specialEventRegistrations.findFirst).mockResolvedValueOnce(undefined as never);
    vi.mocked(db.query.openClasses.findFirst).mockResolvedValueOnce(eventClass as never);
    vi.mocked(getEventClassAvailable).mockResolvedValueOnce(5);
    vi.mocked(computeEventPrice).mockResolvedValueOnce(300);

    const tx = mockTx();
    const result = await purchaseSpecialEventAction('event-1', 'class-1', 'transfer', true);

    expect(result.success).toBe(true);
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });
});
