import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
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
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
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

import { enrollInClassAction } from '../enrollment';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

// Helper to create a future date
function futureDate(daysAhead = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d;
}

// Helper to create a past date
function pastDate(daysAgo = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/**
 * Helper to set up the db.select mock that handles:
 * 1. Subscription query: db.select({...}).from(...).leftJoin(...).where(...)
 * 2. Count query: db.select({...}).from(...).where(...)
 * 3. Duplicate check query: db.select({...}).from(...).innerJoin(...).where(...)
 */
function setupSelectMock(subscriptionResult: unknown[], countResult: { count: number }, duplicateResult: unknown[] = []) {
  let callIndex = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) {
      // Subscription query chain: .from().leftJoin().where()
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(subscriptionResult),
          }),
        }),
      };
    } else if (callIndex === 2) {
      // Count query chain: .from().where()
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([countResult]),
        }),
      };
    } else {
      // Duplicate check query chain: .from().innerJoin().where()
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(duplicateResult),
          }),
        }),
      };
    }
  });
}

/**
 * Property 12: Enrollment Prerequisites Gate
 *
 * For any class enrollment attempt, the operation SHALL succeed only if ALL of:
 * the linked subscription has active = true, the linked payment has confirmed = true,
 * the subscription's expiration_date > now, the subscription's days_remaining > 0,
 * and the class has status = 'scheduled' with class_date > now.
 * If any condition is false, the enrollment SHALL be blocked and no records modified.
 *
 * **Validates: Requirements 4.3, 4.4, 6.1, 6.2, 6.8**
 */
describe('Property 12: Enrollment Prerequisites Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enrollment blocked when ANY single prerequisite fails', async () => {
    const prerequisiteFailureScenarios = fc.constantFrom(
      'inactive_subscription',
      'unconfirmed_payment',
      'expired_subscription',
      'zero_credits',
      'class_not_scheduled',
      'class_in_past'
    );

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        prerequisiteFailureScenarios,
        async (classId, failingPrerequisite) => {
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Build base valid subscription/payment state
          const baseUserSub = {
            id: 'sub-uuid-123',
            daysRemaining: 5,
            paymentId: 'payment-uuid-123',
            subscriptionId: 'plan-uuid-123',
            userId: 'user-uuid-123',
            active: true,
            expirationDate: futureDate(30),
            createdAt: new Date(),
          };

          const basePayment = {
            id: 'payment-uuid-123',
            paymentType: 'transfer' as const,
            confirmed: true,
            dateConfirmed: new Date(),
            createdAt: new Date(),
          };

          // Apply the single failing prerequisite
          let userSub = { ...baseUserSub };
          let payment = { ...basePayment };
          let classStatus = 'scheduled';
          let classDate = futureDate(7);

          switch (failingPrerequisite) {
            case 'inactive_subscription':
              userSub = { ...userSub, active: false };
              break;
            case 'unconfirmed_payment':
              payment = { ...payment, confirmed: false };
              break;
            case 'expired_subscription':
              userSub = { ...userSub, expirationDate: pastDate(5) };
              break;
            case 'zero_credits':
              userSub = { ...userSub, daysRemaining: 0 };
              break;
            case 'class_not_scheduled':
              classStatus = 'cancelled';
              break;
            case 'class_in_past':
              classDate = pastDate(3);
              break;
          }

          // The action filters active=true at the DB level. For inactive_subscription,
          // the DB would return no rows. For unconfirmed_payment, the action filters
          // in JS using .find(row => row.payment?.confirmed === true)
          const subscriptionResult =
            failingPrerequisite === 'inactive_subscription'
              ? []
              : [{ userSub, payment }];

          setupSelectMock(subscriptionResult, { count: 3 });

          // Mock class query
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: classId,
            classDate,
            coachUserId: 'coach-uuid',
            capacity: 10,
            available: 'available',
            classType: 'mat_pilates',
            status: classStatus,
            createdAt: new Date(),
          });

          // Mock duplicate check (no existing enrollment)
          (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

          // Mock transaction (should NOT be called)
          (db.transaction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

          const result = await enrollInClassAction(classId);

          // Enrollment must be blocked
          expect(result.success).toBe(false);

          // Transaction must NOT have been called
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Property 15: Duplicate Enrollment Prevention
 *
 * For any (open_class_id, user_subscription_id) pair that already has an existing
 * record in class_enrolleds, attempting to insert another enrollment with the same
 * pair SHALL fail due to the uk_class_user_enrollment unique constraint.
 *
 * **Validates: Requirements 6.3, 15.2**
 */
describe('Property 15: Duplicate Enrollment Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('same (class_id, subscription_id) pair is blocked when enrollment exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (classId, existingEnrollmentId) => {
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Valid active subscription with confirmed payment
          const userSub = {
            id: 'sub-uuid-123',
            daysRemaining: 5,
            paymentId: 'payment-uuid-123',
            subscriptionId: 'plan-uuid-123',
            userId: 'user-uuid-123',
            active: true,
            expirationDate: futureDate(30),
            createdAt: new Date(),
          };

          const payment = {
            id: 'payment-uuid-123',
            paymentType: 'transfer' as const,
            confirmed: true,
            dateConfirmed: new Date(),
            createdAt: new Date(),
          };

          setupSelectMock([{ userSub, payment }], { count: 3 }, [{ id: existingEnrollmentId }]);

          // Mock class query - valid scheduled future class
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: classId,
            classDate: futureDate(7),
            coachUserId: 'coach-uuid',
            capacity: 10,
            available: 'available',
            classType: 'mat_pilates',
            status: 'scheduled',
            createdAt: new Date(),
          });

          // Transaction should NOT be called
          (db.transaction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

          const result = await enrollInClassAction(classId);

          // Must be blocked
          expect(result.success).toBe(false);
          expect((result as { success: false; error: string }).error).toContain('inscrito');

          // No transaction should have been started
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Property 16: Capacity-Based Enrollment Gate
 *
 * For any Open_Class with capacity = C and current pending enrollment count N,
 * a new enrollment attempt SHALL succeed only if N < C.
 * When N >= C, the attempt SHALL be blocked.
 *
 * **Validates: Requirements 6.5**
 */
describe('Property 16: Capacity-Based Enrollment Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enrollment blocked when enrollment count >= capacity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 10 }),
        async (classId, capacity, extraOverCapacity) => {
          vi.clearAllMocks();
          const enrollmentCount = capacity + extraOverCapacity; // always >= capacity

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Valid active subscription with confirmed payment
          const userSub = {
            id: 'sub-uuid-123',
            daysRemaining: 5,
            paymentId: 'payment-uuid-123',
            subscriptionId: 'plan-uuid-123',
            userId: 'user-uuid-123',
            active: true,
            expirationDate: futureDate(30),
            createdAt: new Date(),
          };

          const payment = {
            id: 'payment-uuid-123',
            paymentType: 'transfer' as const,
            confirmed: true,
            dateConfirmed: new Date(),
            createdAt: new Date(),
          };

          setupSelectMock([{ userSub, payment }], { count: enrollmentCount });

          // Mock class query - valid scheduled future class with given capacity
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: classId,
            classDate: futureDate(7),
            coachUserId: 'coach-uuid',
            capacity,
            available: 'available',
            classType: 'mat_pilates',
            status: 'scheduled',
            createdAt: new Date(),
          });

          // Transaction should NOT be called
          (db.transaction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

          const result = await enrollInClassAction(classId);

          // Must be blocked
          expect(result.success).toBe(false);
          expect((result as { success: false; error: string }).error).toContain('llena');

          // No transaction
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Property 17: Atomic Enrollment Transaction
 *
 * For any successful enrollment, the post-state SHALL have exactly one new record
 * in class_enrolleds AND days_remaining = pre_days_remaining - 1.
 * For any failed enrollment (any validation failure), zero new records SHALL exist
 * in class_enrolleds AND days_remaining SHALL equal the pre-operation value.
 *
 * **Validates: Requirements 6.7**
 */
describe('Property 17: Atomic Enrollment Transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('success: transaction is called with insert + decrement; failure: no transaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 20 }),
        async (classId, daysRemaining) => {
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Valid active subscription with credits
          const userSub = {
            id: 'sub-uuid-123',
            daysRemaining,
            paymentId: 'payment-uuid-123',
            subscriptionId: 'plan-uuid-123',
            userId: 'user-uuid-123',
            active: true,
            expirationDate: futureDate(30),
            createdAt: new Date(),
          };

          const payment = {
            id: 'payment-uuid-123',
            paymentType: 'transfer' as const,
            confirmed: true,
            dateConfirmed: new Date(),
            createdAt: new Date(),
          };

          setupSelectMock([{ userSub, payment }], { count: 3 }, []);

          // Mock class query - valid scheduled future class
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: classId,
            classDate: futureDate(7),
            coachUserId: 'coach-uuid',
            capacity: 10,
            available: 'available',
            classType: 'mat_pilates',
            status: 'scheduled',
            createdAt: new Date(),
          });

          // Track transaction callback execution
          let txInsertCalled = false;
          let txExecuteCalled = false;

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(async (cb: (tx: unknown) => Promise<void>) => {
            const mockTx = {
              insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue(undefined),
              }),
              execute: vi.fn().mockResolvedValue(undefined),
            };
            await cb(mockTx);
            txInsertCalled = mockTx.insert.mock.calls.length > 0;
            txExecuteCalled = mockTx.execute.mock.calls.length > 0;
          });

          const result = await enrollInClassAction(classId);

          // Enrollment should succeed
          expect(result.success).toBe(true);

          // Transaction must have been called
          expect(db.transaction).toHaveBeenCalledTimes(1);

          // Both insert (new enrollment) and execute (decrement days_remaining) must have been called
          expect(txInsertCalled).toBe(true);
          expect(txExecuteCalled).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('failure scenario: no transaction when prerequisites fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (classId) => {
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // No active subscription (empty result)
          setupSelectMock([], { count: 0 });

          (db.transaction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

          const result = await enrollInClassAction(classId);

          // Enrollment must fail
          expect(result.success).toBe(false);

          // Transaction must NOT have been called — no records modified
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });
});
