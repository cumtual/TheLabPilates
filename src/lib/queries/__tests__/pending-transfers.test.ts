// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(result));
  return chain;
}

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from '@/db';
import { getPendingTransferPayments } from '../pending-transfers';

const selectMock = db.select as ReturnType<typeof vi.fn>;

describe('getPendingTransferPayments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges subscription and event rows sorted by most recent first', async () => {
    const older = new Date('2026-01-01T10:00:00Z');
    const newer = new Date('2026-02-01T10:00:00Z');

    selectMock
      .mockReturnValueOnce(
        makeSelectChain([
          { concept: 'Open Lab', amount: 1500, createdAt: older },
        ])
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { concept: 'Masterclass', amount: 800, createdAt: newer },
        ])
      );

    const result = await getPendingTransferPayments('user-1');

    expect(result).toEqual([
      { kind: 'event', concept: 'Masterclass', amount: 800 },
      { kind: 'subscription', concept: 'Open Lab', amount: 1500 },
    ]);
  });

  it('falls back to defaults when nullable subscription fields are null', async () => {
    selectMock
      .mockReturnValueOnce(
        makeSelectChain([{ concept: null, amount: null, createdAt: null }])
      )
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await getPendingTransferPayments('user-1');

    expect(result).toEqual([
      { kind: 'subscription', concept: 'Suscripción', amount: 0 },
    ]);
  });

  it('returns an empty array when the user has no pending transfers', async () => {
    selectMock
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await getPendingTransferPayments('user-1');

    expect(result).toEqual([]);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});
