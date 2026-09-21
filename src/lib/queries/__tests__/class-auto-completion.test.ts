// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { CLASS_DURATION_MS } from '@/lib/utils/date';

/**
 * Auto-completion must use the official 50-minute class duration as its buffer,
 * not the previous 60-minute buffer.
 *
 * A class is completed only once `now - classDate > 50 min`.
 */

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/queries/check-subscription-expiration', () => ({
  checkAndExpireSubscriptions: vi.fn(),
}));

// Spy on `lt` while preserving the real SQL-building behavior.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, lt: vi.fn(actual.lt) };
});

import { lt } from 'drizzle-orm';
import { db } from '@/db';
import { checkAndExpireSubscriptions } from '@/lib/queries/check-subscription-expiration';
import { autoCompletePassedClasses } from '../class-auto-completion';

describe('autoCompletePassedClasses — 50-minute buffer', () => {
  const NOW = new Date('2026-06-10T15:00:00.000Z');
  const CLASS_ID = 'class-1';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    // db.update(...).set({...}).where(...)
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as Mock).mockReturnValue({ set: mockSet });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function getLastBuffer(): Date {
    return (lt as unknown as Mock).mock.calls.at(-1)?.[1] as Date;
  }

  // The db mock evaluates the class against the buffer actually passed to
  // `lt(openClasses.classDate, buffer)` when `.where()` is invoked.
  function mockSelectResult(classDate: Date) {
    const mockWhere = vi.fn().mockImplementation(() => {
      const buffer = getLastBuffer();
      const shouldComplete = buffer ? classDate.getTime() < buffer.getTime() : false;
      return Promise.resolve(shouldComplete ? [{ id: CLASS_ID }] : []);
    });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as Mock).mockReturnValue({ from: mockFrom });
  }

  it('uses exactly 50 minutes as the completion buffer', async () => {
    const classDate = new Date(NOW.getTime() - 51 * 60 * 1000);
    mockSelectResult(classDate);

    await autoCompletePassedClasses();

    const buffer = getLastBuffer();
    expect(NOW.getTime() - buffer.getTime()).toBe(CLASS_DURATION_MS);
    expect(NOW.getTime() - buffer.getTime()).toBe(50 * 60 * 1000);
  });

  it('does NOT complete a class that started 49 minutes ago', async () => {
    const classDate = new Date(NOW.getTime() - 49 * 60 * 1000);
    mockSelectResult(classDate);

    const completed = await autoCompletePassedClasses();

    expect(completed).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
    expect(checkAndExpireSubscriptions).not.toHaveBeenCalled();
  });

  it('completes a class that started 51 minutes ago', async () => {
    const classDate = new Date(NOW.getTime() - 51 * 60 * 1000);
    mockSelectResult(classDate);

    const completed = await autoCompletePassedClasses();

    expect(completed).toBe(1);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(checkAndExpireSubscriptions).toHaveBeenCalledWith(CLASS_ID);
  });
});
