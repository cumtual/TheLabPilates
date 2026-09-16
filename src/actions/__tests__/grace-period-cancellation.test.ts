// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      openClasses: { findFirst: vi.fn() },
      guestEnrollments: { findFirst: vi.fn() },
      userSubscriptions: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: vi.fn(),
  count: vi.fn(() => 'count_fn'),
  notInArray: vi.fn((...args: unknown[]) => ({ type: 'notInArray', args })),
}));

vi.mock('@/lib/guest/eligibility', () => ({
  isUserOpenLabEligible: vi.fn(),
}));

vi.mock('@/lib/guest/credits', () => ({
  getGuestCreditsForCycle: vi.fn(),
  consumeGuestCredit: vi.fn(),
  restoreGuestCredit: vi.fn(),
}));

import { cancelReservationAction, confirmLateCancellationAction } from '../enrollment';
import { cancelGuestAction, cancelReservationWithGuestAction } from '../guest';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { isUserOpenLabEligible } from '@/lib/guest/eligibility';
import { restoreGuestCredit } from '@/lib/guest/credits';

const OWNER = 'user-uuid-123';

function setupEnrollmentSelectMock(options: {
  enrollment: Record<string, unknown>;
  ownerUserId?: string;
  isOpenLab?: boolean;
  activeGuests?: unknown[];
}) {
  const { enrollment, ownerUserId = OWNER, isOpenLab = false, activeGuests = [] } = options;

  let callIndex = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) {
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                enrollment,
                userSubscription: {
                  id: enrollment.userSubscriptionId,
                  userId: ownerUserId,
                },
              },
            ]),
          }),
        }),
      };
    }
    if (callIndex === 2) {
      // Open Lab check chain: .from().leftJoin().where()
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ guest: isOpenLab }]),
          }),
        }),
      };
    }
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(activeGuests),
      }),
    };
  });
}

function mockTransaction() {
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (cb: (tx: unknown) => Promise<void>) => {
      const mockTx = {
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        execute: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
      };
      await cb(mockTx);
    }
  );
}

function mockUpdate() {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });
  return { mockSet };
}

const now = new Date();
const eightMinAgo = new Date(now.getTime() - 8 * 60 * 1000);
const twelveMinAgo = new Date(now.getTime() - 12 * 60 * 1000);
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
const twoHoursAhead = new Date(now.getTime() + 2 * 60 * 60 * 1000);
const thirtyHoursAhead = new Date(now.getTime() + 30 * 60 * 60 * 1000);

describe('Grace period: titular enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: OWNER,
      role: 'client',
      email: 'client@test.com',
    });
  });

  it('refunds when cancelling 8 min after booking, even with the class in 2h', async () => {
    setupEnrollmentSelectMock({
      enrollment: {
        id: 'enrollment-1',
        openClassId: 'class-1',
        userSubscriptionId: 'sub-1',
        status: 'pending',
        createdAt: eightMinAgo,
      },
    });
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'class-1',
      classDate: twoHoursAhead,
    });
    mockTransaction();

    const result = await cancelReservationAction('enrollment-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('crédito');
    }
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('late-cancels without refund 12 min after booking with the class in 2h', async () => {
    setupEnrollmentSelectMock({
      enrollment: {
        id: 'enrollment-1',
        openClassId: 'class-1',
        userSubscriptionId: 'sub-1',
        status: 'pending',
        createdAt: twelveMinAgo,
      },
    });
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'class-1',
      classDate: twoHoursAhead,
    });

    const result = await cancelReservationAction('enrollment-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('LATE_CANCELLATION');
    }
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refunds the standard ≥24h cancellation regardless of grace', async () => {
    setupEnrollmentSelectMock({
      enrollment: {
        id: 'enrollment-1',
        openClassId: 'class-1',
        userSubscriptionId: 'sub-1',
        status: 'pending',
        createdAt: oneHourAgo,
      },
    });
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'class-1',
      classDate: thirtyHoursAhead,
    });
    mockTransaction();

    const result = await cancelReservationAction('enrollment-1');

    expect(result.success).toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('confirmLateCancellation refunds when confirmed inside the grace window', async () => {
    setupEnrollmentSelectMock({
      enrollment: {
        id: 'enrollment-1',
        openClassId: 'class-1',
        userSubscriptionId: 'sub-1',
        status: 'pending',
        createdAt: eightMinAgo,
      },
    });
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'class-1',
      classDate: twoHoursAhead,
    });
    mockTransaction();
    mockUpdate();

    const result = await confirmLateCancellationAction('enrollment-1');

    expect(result.success).toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // No late_cancelled status write — the enrollment is deleted with a refund
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('Grace period: guest flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: OWNER,
      role: 'client',
      email: 'client@test.com',
    });
    (isUserOpenLabEligible as ReturnType<typeof vi.fn>).mockResolvedValue({
      eligible: true,
      userSubscription: { id: 'sub-1' },
    });
  });

  it('cancelGuestAction refunds the guest credit 8 min after booking', async () => {
    (db.query.guestEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'guest-1',
      status: 'pending',
      registeredById: OWNER,
      openClassId: 'class-1',
      createdAt: eightMinAgo,
    });
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'class-1',
      classDate: twoHoursAhead,
    });
    mockUpdate();

    const result = await cancelGuestAction('guest-1');

    expect(result.success).toBe(true);
    expect(restoreGuestCredit).toHaveBeenCalledWith(OWNER, 'sub-1');
  });

  it('cancelGuestAction late-cancels without refund 12 min after booking', async () => {
    (db.query.guestEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'guest-1',
      status: 'pending',
      registeredById: OWNER,
      openClassId: 'class-1',
      createdAt: twelveMinAgo,
    });
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'class-1',
      classDate: twoHoursAhead,
    });

    const result = await cancelGuestAction('guest-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('LATE_CANCELLATION');
    }
    expect(restoreGuestCredit).not.toHaveBeenCalled();
  });

  it('cancelReservationWithGuestAction refunds when cancelling 8 min after booking', async () => {
    setupEnrollmentSelectMock({
      enrollment: {
        id: 'enrollment-1',
        openClassId: 'class-1',
        userSubscriptionId: 'sub-1',
        status: 'pending',
        createdAt: eightMinAgo,
      },
    });
    (db.query.guestEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'guest-1',
    });
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'class-1',
      classDate: twoHoursAhead,
    });
    (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sub-1',
    });
    mockTransaction();

    const result = await cancelReservationWithGuestAction('enrollment-1');

    expect(result.success).toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(restoreGuestCredit).toHaveBeenCalledWith(OWNER, 'sub-1');
  });
});
