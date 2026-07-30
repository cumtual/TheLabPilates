import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the actions
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
}));

import { cancelReservationAction, confirmLateCancellationAction } from '../enrollment';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

// Helper to create a future date at least N hours ahead
function futureDateHoursAhead(hours: number): Date {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d;
}

// Helper to create a past date
function pastDate(daysAgo = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/**
 * Property 18: Timely Cancellation Refunds Credit
 *
 * For any enrollment cancellation where class_date - cancellation_time >= 24 hours,
 * the Enrollment record SHALL be deleted from class_enrolleds AND the client's
 * days_remaining SHALL equal pre_days_remaining + 1.
 *
 * **Validates: Requirements 7.1**
 */
describe('Property 18: Timely Cancellation Refunds Credit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancel ≥24h before: transaction is called with delete + increment days_remaining', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 25, max: 168 }), // hours until class (>= 25 to ensure >= 24h)
        async (enrollmentId, subscriptionId, hoursUntilClass) => {
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Mock enrollment: pending status
          (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: enrollmentId,
            openClassId: 'class-uuid-123',
            userSubscriptionId: subscriptionId,
            status: 'pending',
            createdAt: new Date(),
          });

          // Mock class: future date ≥24h away
          const classDate = futureDateHoursAhead(hoursUntilClass);
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'class-uuid-123',
            classDate,
            coachUserId: 'coach-uuid',
            capacity: 10,
            available: 'available',
            classType: 'mat_pilates',
            status: 'scheduled',
            createdAt: new Date(),
          });

          // Track transaction callback execution
          let txDeleteCalled = false;
          let txExecuteCalled = false;

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(async (cb: (tx: unknown) => Promise<void>) => {
            const mockTx = {
              delete: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
              execute: vi.fn().mockResolvedValue(undefined),
            };
            await cb(mockTx);
            txDeleteCalled = mockTx.delete.mock.calls.length > 0;
            txExecuteCalled = mockTx.execute.mock.calls.length > 0;
          });

          const result = await cancelReservationAction(enrollmentId);

          // Cancellation should succeed
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.message).toContain('crédito');
          }

          // Transaction must have been called
          expect(db.transaction).toHaveBeenCalledTimes(1);

          // Both delete (enrollment) and execute (increment days_remaining) must have been called
          expect(txDeleteCalled).toBe(true);
          expect(txExecuteCalled).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Property 19: Late Cancellation No Refund
 *
 * For any enrollment cancellation confirmed where class_date - cancellation_time < 24 hours,
 * the Enrollment status SHALL be set to "late_cancelled" AND the client's days_remaining
 * SHALL remain equal to its pre-operation value.
 *
 * **Validates: Requirements 7.3**
 */
describe('Property 19: Late Cancellation No Refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirmLateCancellation: status set to late_cancelled, no days_remaining change', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 23 }), // hours until class (< 24h)
        async (enrollmentId, subscriptionId, hoursUntilClass) => {
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Mock enrollment: pending status
          (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: enrollmentId,
            openClassId: 'class-uuid-123',
            userSubscriptionId: subscriptionId,
            status: 'pending',
            createdAt: new Date(),
          });

          // Mock class: future date <24h away
          const classDate = futureDateHoursAhead(hoursUntilClass);
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'class-uuid-123',
            classDate,
            coachUserId: 'coach-uuid',
            capacity: 10,
            available: 'available',
            classType: 'mat_pilates',
            status: 'scheduled',
            createdAt: new Date(),
          });

          // Mock db.update for setting status to late_cancelled
          const mockWhere = vi.fn().mockResolvedValue(undefined);
          const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
          (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({ set: mockSet });

          const result = await confirmLateCancellationAction(enrollmentId);

          // Should succeed
          expect(result.success).toBe(true);

          // db.update should have been called (to set status to 'late_cancelled')
          expect(db.update).toHaveBeenCalledTimes(1);

          // Verify set was called with status 'late_cancelled'
          expect(mockSet).toHaveBeenCalledWith({ status: 'late_cancelled' });

          // Transaction should NOT be called (no atomic delete+increment)
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Property 20: Non-Eligible Enrollment Cancellation Block
 *
 * For any Enrollment where status is not "pending" OR class_date is in the past,
 * a cancellation attempt SHALL fail and the Enrollment record SHALL remain unchanged.
 *
 * **Validates: Requirements 7.5**
 */
describe('Property 20: Non-Eligible Enrollment Cancellation Block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancellation blocked for non-pending enrollment statuses', async () => {
    const nonPendingStatuses = fc.constantFrom('attended', 'absent', 'late_cancelled');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        nonPendingStatuses,
        async (enrollmentId, subscriptionId, status) => {
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Mock enrollment with non-pending status
          (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: enrollmentId,
            openClassId: 'class-uuid-123',
            userSubscriptionId: subscriptionId,
            status,
            createdAt: new Date(),
          });

          const result = await cancelReservationAction(enrollmentId);

          // Must be blocked
          expect(result.success).toBe(false);

          // No database modifications
          expect(db.transaction).not.toHaveBeenCalled();
          expect(db.update).not.toHaveBeenCalled();
          expect(db.delete).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });

  it('cancellation blocked for pending enrollment with past class date', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 30 }), // days in the past
        async (enrollmentId, subscriptionId, daysAgo) => {
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Mock enrollment: pending status
          (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: enrollmentId,
            openClassId: 'class-uuid-123',
            userSubscriptionId: subscriptionId,
            status: 'pending',
            createdAt: new Date(),
          });

          // Mock class: past date
          const classDate = pastDate(daysAgo);
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'class-uuid-123',
            classDate,
            coachUserId: 'coach-uuid',
            capacity: 10,
            available: 'available',
            classType: 'mat_pilates',
            status: 'scheduled',
            createdAt: new Date(),
          });

          const result = await cancelReservationAction(enrollmentId);

          // Must be blocked
          expect(result.success).toBe(false);
          expect((result as { success: false; error: string }).error).toContain('pasó');

          // No database modifications
          expect(db.transaction).not.toHaveBeenCalled();
          expect(db.update).not.toHaveBeenCalled();
          expect(db.delete).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });
});
