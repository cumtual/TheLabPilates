import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      specialEvents: { findFirst: vi.fn() },
      subscriptions: { findMany: vi.fn() },
      specialEventRegistrations: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));

vi.mock('@/lib/email/service', () => ({
  sendSpecialEventCancellationEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentRejectedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/events/capacity', () => ({
  getEventClassAvailable: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));

import {
  createSpecialEventAction,
  addEventClassAction,
  cancelSpecialEventAction,
  confirmEventPaymentAction,
} from '../admin-events';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { getEventClassAvailable } from '@/lib/events/capacity';
import { sendSpecialEventCancellationEmail } from '@/lib/email/service';

const adminSession = { sub: 'admin-1', role: 'admin', email: 'a@test.com' };

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('title', overrides.title ?? 'Evento de prueba');
  fd.set('description', overrides.description ?? 'Descripción completa del evento');
  fd.set('shortDescription', overrides.shortDescription ?? 'Breve descripción');
  fd.set('price', overrides.price ?? '500');
  fd.set('startDate', overrides.startDate ?? '2030-09-15T21:30');
  fd.set('endDate', overrides.endDate ?? '2030-09-15T23:30');
  if (overrides.showOnLanding) fd.set('showOnLanding', overrides.showOnLanding);
  return fd;
}

function mockTx() {
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'event-new' }]),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    execute: vi.fn(() => Promise.resolve()),
  };
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(tx)
  );
  return tx;
}

describe('createSpecialEventAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(adminSession as never);
  });

  it('rejects non-admin sessions', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({ sub: 'u', role: 'client' } as never);
    const result = await createSpecialEventAction(makeFormData());
    expect(result.success).toBe(false);
  });

  it('rejects when an active event already exists', async () => {
    vi.mocked(db.query.specialEvents.findFirst).mockResolvedValueOnce({
      id: 'existing',
      status: 'active',
    } as never);

    const result = await createSpecialEventAction(makeFormData());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/ya existe un evento activo/i);
  });

  it('rejects a short description longer than 150 characters', async () => {
    const result = await createSpecialEventAction(
      makeFormData({ shortDescription: 'x'.repeat(151) })
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe('shortDescription');
  });

  it('creates the event and its discount matrix', async () => {
    vi.mocked(db.query.specialEvents.findFirst).mockResolvedValueOnce(undefined as never);
    vi.mocked(db.query.subscriptions.findMany).mockResolvedValueOnce([
      { id: 'plan-open-lab', name: 'Open Lab' },
    ] as never);

    const tx = mockTx();
    const fd = makeFormData();
    fd.set('discount_plan-open-lab', '150');

    const result = await createSpecialEventAction(fd);
    expect(result.success).toBe(true);
    // event + 1 discount
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });
});

describe('addEventClassAction — event date range', () => {
  const event = {
    id: 'event-1',
    status: 'active',
    startDate: new Date('2030-09-15T21:00:00Z'),
    endDate: new Date('2030-09-16T09:00:00Z'),
  };

  function makeClassFormData(classDate: string): FormData {
    const fd = new FormData();
    fd.set('classDate', classDate);
    fd.set('capacity', '10');
    fd.set('classType', 'yoga');
    fd.set('coachId', 'coach-1');
    return fd;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(adminSession as never);
    vi.mocked(db.query.specialEvents.findFirst).mockResolvedValue(event as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: 'coach-1',
      role: 'coach',
      deletedAt: null,
    } as never);
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn(() => Promise.resolve()),
    }));
  });

  it('rejects a class scheduled before the event starts', async () => {
    const result = await addEventClassAction('event-1', makeClassFormData('2030-09-15T12:00'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe('classDate');
  });

  it('rejects a class scheduled after the event ends', async () => {
    const result = await addEventClassAction('event-1', makeClassFormData('2030-09-16T12:00'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe('classDate');
  });

  it('accepts a class inside the event range', async () => {
    const result = await addEventClassAction('event-1', makeClassFormData('2030-09-15T18:00'));
    expect(result.success).toBe(true);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});

describe('cancelSpecialEventAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(adminSession as never);
  });

  it('marks confirmed registrations as refund_pending and notifies by email', async () => {
    vi.mocked(db.query.specialEvents.findFirst).mockResolvedValueOnce({
      id: 'event-1',
      status: 'active',
      title: 'Evento',
      startDate: new Date('2030-09-15T21:30:00Z'),
    } as never);

    // select(...).from(...).innerJoin(...).where(...)
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () =>
            Promise.resolve([
              { email: 'user@test.com', name: 'User', status: 'confirmed' },
            ]),
        }),
      }),
    }));

    const tx = mockTx();
    const result = await cancelSpecialEventAction('event-1');

    expect(result.success).toBe(true);
    expect(tx.update).toHaveBeenCalledTimes(3);
    expect(sendSpecialEventCancellationEmail).toHaveBeenCalledTimes(1);
  });
});

describe('confirmEventPaymentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(adminSession as never);
  });

  it('rejects when the class is full', async () => {
    vi.mocked(db.query.specialEventRegistrations.findFirst).mockResolvedValueOnce({
      id: 'reg-1',
      status: 'pending',
      openClassId: 'class-1',
      paymentId: 'pay-1',
      specialEventId: 'event-1',
    } as never);
    vi.mocked(getEventClassAvailable).mockResolvedValueOnce(0);
    mockTx();

    const result = await confirmEventPaymentAction('reg-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/llena/i);
  });

  it('confirms the payment when capacity is available', async () => {
    vi.mocked(db.query.specialEventRegistrations.findFirst).mockResolvedValueOnce({
      id: 'reg-1',
      status: 'pending',
      openClassId: 'class-1',
      paymentId: 'pay-1',
      specialEventId: 'event-1',
    } as never);
    vi.mocked(getEventClassAvailable).mockResolvedValueOnce(3);
    const tx = mockTx();

    const result = await confirmEventPaymentAction('reg-1');
    expect(result.success).toBe(true);
    expect(tx.update).toHaveBeenCalledTimes(2);
  });
});
