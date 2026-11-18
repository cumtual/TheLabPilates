import { describe, it, expect, vi, beforeEach } from 'vitest';

/** SPEC-GUEST-QR-CHECKIN D1: el invitado que agrega el admin nace con su token QR. */

const mocks = vi.hoisted(() => ({ insertValues: vi.fn() }));

vi.mock('@/db', () => ({
  db: { query: { openClasses: { findFirst: vi.fn() } }, transaction: vi.fn() },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/guest/capacity', () => ({ getAvailableCapacity: vi.fn() }));

import { adminAddGuestAction } from '../admin-guest';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { getAvailableCapacity } from '@/lib/guest/capacity';

function fakeTx() {
  const where = vi.fn().mockResolvedValue([{ count: 0 }]);
  return {
    execute: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where }) }),
    insert: vi.fn().mockReturnValue({ values: mocks.insertValues.mockResolvedValue(undefined) }),
  };
}

describe('adminAddGuestAction — token QR', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSession).mockResolvedValue({ sub: 'admin-1', role: 'admin', email: 'a@test.com' } as never);
    vi.mocked(db.query.openClasses.findFirst).mockResolvedValue({ id: 'class-1', status: 'scheduled', capacity: 10 } as never);
    vi.mocked(getAvailableCapacity).mockResolvedValue(5);
    vi.mocked(db.transaction).mockImplementation(async (work) => work(fakeTx() as never));
  });

  it('guarda un checkin_token de 64 hex con origin admin', async () => {
    const result = await adminAddGuestAction('class-1', 'María López');

    expect(result.success).toBe(true);
    const values = mocks.insertValues.mock.calls[0][0];
    expect(values).toMatchObject({ origin: 'admin', guestName: 'María López', status: 'pending' });
    expect(values.checkinToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cada invitado recibe un token distinto (D3)', async () => {
    await adminAddGuestAction('class-1', 'Invitado Uno');
    await adminAddGuestAction('class-1', 'Invitado Dos');
    const [first, second] = mocks.insertValues.mock.calls.map(([values]) => values.checkinToken);
    expect(first).not.toBe(second);
  });
});
