// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 18: Invariante de days_remaining para Open Lab
 * Validates: Requirements 10.1, 10.2, 10.3, 10.6
 *
 * For any reservation or cancellation operation on a subscription with
 * `guest = true` (Open Lab), the `days_remaining` field of `user_suscriptions`
 * must remain unchanged before and after the operation.
 */

// ─── Mock Setup ────────────────────────────────────────────────────────────────

// Track SQL execute calls to detect days_remaining modifications
let executeCalls: unknown[] = [];
let transactionExecuteCalls: unknown[] = [];

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      openClasses: {
        findFirst: vi.fn(),
      },
      classEnrollments: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    execute: vi.fn((...args: unknown[]) => {
      executeCalls.push(args);
      return Promise.resolve(undefined);
    }),
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

vi.mock('@/lib/guest/capacity', () => ({
  getAvailableCapacity: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ type: 'sql_template', args })),
    { raw: vi.fn() }
  ),
  notInArray: vi.fn((...args: unknown[]) => ({ type: 'notInArray', args })),
  count: vi.fn(() => 'count_fn'),
}));

import { enrollInClassAction, cancelReservationAction } from '../enrollment';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { getAvailableCapacity } from '@/lib/guest/capacity';

// ─── Arbitraries (Generators) ──────────────────────────────────────────────────

const uuidArb = fc.uuid();

const daysRemainingArb = fc.integer({ min: 0, max: 30 });

/** Future date to ensure class hasn't passed (>= 25h ahead to cover both timely and late paths) */
const futureDateArb = fc.integer({ min: 25, max: 720 }).map((hours) => {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d;
});

const capacityArb = fc.integer({ min: 1, max: 20 });

// ─── Helper Functions ──────────────────────────────────────────────────────────

function resetTracking() {
  executeCalls = [];
  transactionExecuteCalls = [];
}

/**
 * Creates a mock transaction that tracks execute calls (which are used
 * to modify days_remaining via raw SQL).
 */
function createMockTransaction() {
  return async (cb: (tx: unknown) => Promise<void>) => {
    const mockTx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
      execute: vi.fn((...args: unknown[]) => {
        transactionExecuteCalls.push(args);
        return Promise.resolve(undefined);
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    await cb(mockTx);
    return undefined;
  };
}

/**
 * Checks if any execute call contains a days_remaining modification.
 * The enrollment action uses raw SQL like:
 *   `UPDATE user_suscriptions SET days_remaining = days_remaining - 1 ...`
 *   `UPDATE user_suscriptions SET days_remaining = days_remaining + 1 ...`
 */
function wasDaysRemainingModified(): boolean {
  return transactionExecuteCalls.length > 0;
}

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Property 18: Invariante de days_remaining para Open Lab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTracking();
  });

  describe('enrollInClassAction: Open Lab does NOT decrement days_remaining', () => {
    /**
     * **Validates: Requirements 10.1, 10.2**
     *
     * For any enrollment operation on a subscription with guest = true (Open Lab),
     * days_remaining must NOT be decremented. The system should skip the
     * `UPDATE user_suscriptions SET days_remaining = days_remaining - 1` SQL.
     */
    it('property: enrolling with Open Lab subscription never calls execute to modify days_remaining', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          daysRemainingArb,
          futureDateArb,
          capacityArb,
          async (userId, classId, userSubId, daysRemaining, classDate, capacity) => {
            vi.clearAllMocks();
            resetTracking();

            // Mock authenticated session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'openlab@test.com',
            });

            // Mock db.select() for fetching user subscription
            // Returns an Open Lab subscription (guest = true) with confirmed payment
            const selectFromMock = vi.fn();
            const joinChain = {
              leftJoin: vi.fn().mockReturnThis(),
              where: vi.fn().mockResolvedValue([
                {
                  userSub: {
                    id: userSubId,
                    daysRemaining,
                    paymentId: 'payment-1',
                    subscriptionId: 'sub-1',
                    userId,
                    active: true,
                    status: 'active',
                    expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    createdAt: new Date(),
                  },
                  payment: {
                    id: 'payment-1',
                    paymentType: 'cash',
                    confirmed: true,
                    dateConfirmed: new Date(),
                    createdAt: new Date(),
                  },
                  subscription: {
                    id: 'sub-1',
                    name: 'Open Lab',
                    sessions: 0,
                    guest: true, // <-- Open Lab
                    price: 3000,
                  },
                },
              ]),
            };
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue(joinChain),
            });

            // Mock class lookup
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: classId,
              classDate,
              coachUserId: 'coach-1',
              capacity,
              available: 'available',
              classType: 'mat_pilates',
              status: 'scheduled',
              createdAt: new Date(),
            });

            // Mock getAvailableCapacity to have space
            (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
              Math.max(1, capacity)
            );

            // Mock duplicate enrollment check (no existing enrollment)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([]),
                }),
              }),
            });

            // Mock transaction
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
              createMockTransaction()
            );

            const result = await enrollInClassAction(classId);

            // Enrollment should succeed
            expect(result.success).toBe(true);

            // CRITICAL ASSERTION: days_remaining must NOT be modified
            // The transaction's execute() should NOT be called for Open Lab
            expect(wasDaysRemainingModified()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: days_remaining value is irrelevant for Open Lab enrollment success', async () => {
      /**
       * Even when days_remaining = 0, Open Lab users can still enroll
       * because the system should not check or use days_remaining for them.
       *
       * **Validates: Requirements 10.1, 10.7**
       */
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          fc.constant(0), // days_remaining = 0
          futureDateArb,
          capacityArb,
          async (userId, classId, userSubId, daysRemaining, classDate, capacity) => {
            vi.clearAllMocks();
            resetTracking();

            // Mock session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'openlab@test.com',
            });

            // Open Lab sub with days_remaining = 0 (should still work)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnThis(),
                where: vi.fn().mockResolvedValue([
                  {
                    userSub: {
                      id: userSubId,
                      daysRemaining: 0, // No days remaining
                      paymentId: 'payment-1',
                      subscriptionId: 'sub-1',
                      userId,
                      active: true,
                      status: 'active',
                      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                      createdAt: new Date(),
                    },
                    payment: {
                      id: 'payment-1',
                      paymentType: 'cash',
                      confirmed: true,
                      dateConfirmed: new Date(),
                      createdAt: new Date(),
                    },
                    subscription: {
                      id: 'sub-1',
                      name: 'Open Lab',
                      sessions: 0,
                      guest: true, // Open Lab
                      price: 3000,
                    },
                  },
                ]),
              }),
            });

            // Mock class
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: classId,
              classDate,
              coachUserId: 'coach-1',
              capacity,
              available: 'available',
              classType: 'mat_pilates',
              status: 'scheduled',
              createdAt: new Date(),
            });

            // Available capacity
            (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
              Math.max(1, capacity)
            );

            // No duplicate
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([]),
                }),
              }),
            });

            // Mock transaction
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
              createMockTransaction()
            );

            const result = await enrollInClassAction(classId);

            // Should succeed even with days_remaining = 0
            expect(result.success).toBe(true);

            // days_remaining must NOT be modified
            expect(wasDaysRemainingModified()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('cancelReservationAction: Open Lab does NOT increment days_remaining', () => {
    /**
     * **Validates: Requirements 10.3, 10.6**
     *
     * For any cancellation (timely, ≥24h before class) of an enrollment under
     * an Open Lab subscription, the system must NOT increment days_remaining.
     */
    it('property: timely cancellation with Open Lab never calls execute to modify days_remaining', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          daysRemainingArb,
          fc.integer({ min: 25, max: 168 }), // hours until class (>= 25h to be timely)
          async (userId, enrollmentId, userSubId, daysRemaining, hoursUntilClass) => {
            vi.clearAllMocks();
            resetTracking();

            const classDate = new Date(Date.now() + hoursUntilClass * 60 * 60 * 1000);

            // Mock session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'openlab@test.com',
            });

            // Mock enrollment
            (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: enrollmentId,
              openClassId: 'class-1',
              userSubscriptionId: userSubId,
              status: 'pending',
              createdAt: new Date(),
            });

            // Mock subscription check (Open Lab = guest: true)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([
                    { guest: true },
                  ]),
                }),
              }),
            });

            // Mock guest enrollments check (no associated guest)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            });

            // Mock class
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: 'class-1',
              classDate,
              coachUserId: 'coach-1',
              capacity: 10,
              available: 'available',
              classType: 'mat_pilates',
              status: 'scheduled',
              createdAt: new Date(),
            });

            // Mock transaction (timely cancellation triggers delete + optional execute)
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
              createMockTransaction()
            );

            const result = await cancelReservationAction(enrollmentId);

            // Should succeed (timely cancellation)
            expect(result.success).toBe(true);

            // CRITICAL ASSERTION: days_remaining must NOT be modified for Open Lab
            expect(wasDaysRemainingModified()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: for any daysRemaining value, Open Lab cancellation preserves it unchanged', async () => {
      /**
       * Regardless of the current days_remaining value (0, 5, 30, etc.),
       * the system must never attempt to modify it for Open Lab subscriptions.
       *
       * **Validates: Requirements 10.3, 10.6**
       */
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          fc.integer({ min: 0, max: 100 }), // any days_remaining value
          fc.integer({ min: 25, max: 720 }), // hours ahead (timely)
          async (userId, enrollmentId, userSubId, daysRemaining, hoursUntilClass) => {
            vi.clearAllMocks();
            resetTracking();

            const classDate = new Date(Date.now() + hoursUntilClass * 60 * 60 * 1000);

            // Mock session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'openlab@test.com',
            });

            // Mock enrollment
            (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: enrollmentId,
              openClassId: 'class-1',
              userSubscriptionId: userSubId,
              status: 'pending',
              createdAt: new Date(),
            });

            // Mock subscription check (Open Lab)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([
                    { guest: true },
                  ]),
                }),
              }),
            });

            // Mock guest check (no associated guest)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            });

            // Mock class
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: 'class-1',
              classDate,
              coachUserId: 'coach-1',
              capacity: 10,
              available: 'available',
              classType: 'mat_pilates',
              status: 'scheduled',
              createdAt: new Date(),
            });

            // Mock transaction
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
              createMockTransaction()
            );

            const result = await cancelReservationAction(enrollmentId);

            expect(result.success).toBe(true);

            // days_remaining must remain untouched
            expect(wasDaysRemainingModified()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Contrast: Non-Open Lab DOES modify days_remaining', () => {
    /**
     * Sanity check: For non-Open Lab subscriptions (guest = false),
     * the enrollment action SHOULD call execute to modify days_remaining.
     * This validates that our assertion is meaningful — if Open Lab is treated
     * differently from regular subscriptions.
     */
    it('property: enrolling with non-Open Lab subscription DOES call execute for days_remaining', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          fc.integer({ min: 1, max: 30 }), // must have days_remaining > 0 for non-OpenLab
          futureDateArb,
          capacityArb,
          async (userId, classId, userSubId, daysRemaining, classDate, capacity) => {
            vi.clearAllMocks();
            resetTracking();

            // Mock session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'regular@test.com',
            });

            // Non-Open Lab subscription (guest = false)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnThis(),
                where: vi.fn().mockResolvedValue([
                  {
                    userSub: {
                      id: userSubId,
                      daysRemaining,
                      paymentId: 'payment-1',
                      subscriptionId: 'sub-1',
                      userId,
                      active: true,
                      status: 'active',
                      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                      createdAt: new Date(),
                    },
                    payment: {
                      id: 'payment-1',
                      paymentType: 'cash',
                      confirmed: true,
                      dateConfirmed: new Date(),
                      createdAt: new Date(),
                    },
                    subscription: {
                      id: 'sub-1',
                      name: 'Básico',
                      sessions: 8,
                      guest: false, // <-- NOT Open Lab
                      price: 1500,
                    },
                  },
                ]),
              }),
            });

            // Mock class
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: classId,
              classDate,
              coachUserId: 'coach-1',
              capacity,
              available: 'available',
              classType: 'mat_pilates',
              status: 'scheduled',
              createdAt: new Date(),
            });

            // Available capacity
            (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
              Math.max(1, capacity)
            );

            // No duplicate
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([]),
                }),
              }),
            });

            // Mock transaction — for non-Open Lab, execute SHOULD be called
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
              createMockTransaction()
            );

            const result = await enrollInClassAction(classId);

            expect(result.success).toBe(true);

            // For non-Open Lab, days_remaining MUST be decremented
            expect(wasDaysRemainingModified()).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: timely cancellation with non-Open Lab DOES call execute for days_remaining', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          fc.integer({ min: 0, max: 30 }),
          fc.integer({ min: 25, max: 168 }),
          async (userId, enrollmentId, userSubId, daysRemaining, hoursUntilClass) => {
            vi.clearAllMocks();
            resetTracking();

            const classDate = new Date(Date.now() + hoursUntilClass * 60 * 60 * 1000);

            // Mock session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'regular@test.com',
            });

            // Mock enrollment
            (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: enrollmentId,
              openClassId: 'class-1',
              userSubscriptionId: userSubId,
              status: 'pending',
              createdAt: new Date(),
            });

            // Non-Open Lab subscription (guest = false)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([
                    { guest: false },
                  ]),
                }),
              }),
            });

            // No associated guest
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            });

            // Mock class
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: 'class-1',
              classDate,
              coachUserId: 'coach-1',
              capacity: 10,
              available: 'available',
              classType: 'mat_pilates',
              status: 'scheduled',
              createdAt: new Date(),
            });

            // Mock transaction — execute should be called for non-Open Lab
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
              createMockTransaction()
            );

            const result = await cancelReservationAction(enrollmentId);

            expect(result.success).toBe(true);

            // For non-Open Lab, days_remaining MUST be incremented
            expect(wasDaysRemainingModified()).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
