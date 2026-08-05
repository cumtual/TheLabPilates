// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Bug Condition Exploration Test
 *
 * **Property 1: Bug Condition** - Late Cancellation Still Refunds Credit
 *
 * This test encodes the EXPECTED (correct) behavior for late cancellations:
 * - cancelReservationAction returns { success: false, error: 'LATE_CANCELLATION', field: 'late' }
 * - confirmLateCancellationAction sets enrollment status to 'late_cancelled' without refund
 *
 * On UNFIXED code, this test would FAIL because the original implementation
 * deletes enrollment and increments days_remaining for ALL cancellations regardless of timing.
 *
 * **Validates: Requirements 1.1, 1.2, 2.1**
 */

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

import { cancelReservationAction, confirmLateCancellationAction } from '@/actions/enrollment';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

// Helper to create a future date N hours ahead from now
function futureDateHoursAhead(hours: number): Date {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d;
}

describe('Property 1: Bug Condition - Late Cancellation Does Not Refund Credit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * PBT: For any hoursUntilClass in [1, 23] (all satisfy isBugCondition),
   * cancelReservationAction should detect the late cancellation and return
   * the LATE_CANCELLATION signal instead of deleting enrollment + refunding.
   *
   * On unfixed code: would delete enrollment and increment days_remaining.
   * On fixed code: returns { success: false, error: 'LATE_CANCELLATION', field: 'late' }
   */
  it('cancelReservationAction signals LATE_CANCELLATION for all cancellations <24h before class', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 23 }), // hoursUntilClass: all within bug condition
        fc.uuid(),
        fc.uuid(),
        async (hoursUntilClass, enrollmentId, subscriptionId) => {
          vi.clearAllMocks();

          // Mock authenticated client session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Mock enrollment: pending status
          (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: enrollmentId,
            openClassId: 'class-uuid-456',
            userSubscriptionId: subscriptionId,
            status: 'pending',
            createdAt: new Date(),
          });

          // Mock class: future date <24h away
          const classDate = futureDateHoursAhead(hoursUntilClass);
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'class-uuid-456',
            classDate,
            coachUserId: 'coach-uuid',
            capacity: 10,
            available: 'available',
            classType: 'mat_pilates',
            status: 'scheduled',
            createdAt: new Date(),
          });

          const result = await cancelReservationAction(enrollmentId);

          // Expected behavior: late cancellation signal (NOT a successful delete+refund)
          expect(result.success).toBe(false);
          expect((result as { success: false; error: string; field?: string }).error).toBe('LATE_CANCELLATION');
          expect((result as { success: false; error: string; field?: string }).field).toBe('late');

          // No transaction should be called (no delete + refund)
          expect(db.transaction).not.toHaveBeenCalled();

          // No direct update should happen at this stage
          expect(db.update).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * PBT: For any hoursUntilClass in [1, 23], confirmLateCancellationAction
   * should set enrollment status to 'late_cancelled' WITHOUT modifying days_remaining.
   *
   * On unfixed code: this function wouldn't exist, or would still refund.
   * On fixed code: sets status to 'late_cancelled', no days_remaining change.
   */
  it('confirmLateCancellationAction sets status to late_cancelled without days_remaining increment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 23 }), // hoursUntilClass: all within bug condition
        fc.uuid(),
        fc.uuid(),
        async (hoursUntilClass, enrollmentId, subscriptionId) => {
          vi.clearAllMocks();

          // Mock authenticated client session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Mock enrollment: pending status
          (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: enrollmentId,
            openClassId: 'class-uuid-456',
            userSubscriptionId: subscriptionId,
            status: 'pending',
            createdAt: new Date(),
          });

          // Mock class: future date <24h away
          const classDate = futureDateHoursAhead(hoursUntilClass);
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'class-uuid-456',
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
          expect((result as { success: true; message: string }).message).toContain('cancelación');

          // db.update should have been called to set status to 'late_cancelled'
          expect(db.update).toHaveBeenCalledTimes(1);
          expect(mockSet).toHaveBeenCalledWith({ status: 'late_cancelled' });

          // Transaction should NOT be called (no atomic delete + increment)
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Integration: Full late cancellation flow
   * cancelReservationAction → LATE_CANCELLATION signal → confirmLateCancellationAction → success
   *
   * Verifies the two-step flow works end-to-end for a specific late cancellation scenario.
   */
  it('full late cancellation flow: signal then confirm without refund (hoursUntilClass=4)', async () => {
    const enrollmentId = 'enrollment-late-001';
    const subscriptionId = 'sub-late-001';

    // Step 1: cancelReservationAction detects late cancellation
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sub: 'user-uuid-123',
      role: 'client',
      email: 'client@test.com',
    });

    (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: enrollmentId,
      openClassId: 'class-uuid-789',
      userSubscriptionId: subscriptionId,
      status: 'pending',
      createdAt: new Date(),
    });

    const classDate = futureDateHoursAhead(4); // 4 hours away — late
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'class-uuid-789',
      classDate,
      coachUserId: 'coach-uuid',
      capacity: 10,
      available: 'available',
      classType: 'mat_pilates',
      status: 'scheduled',
      createdAt: new Date(),
    });

    const cancelResult = await cancelReservationAction(enrollmentId);

    // Should signal late cancellation
    expect(cancelResult.success).toBe(false);
    expect((cancelResult as { success: false; error: string; field?: string }).error).toBe('LATE_CANCELLATION');
    expect((cancelResult as { success: false; error: string; field?: string }).field).toBe('late');
    expect(db.transaction).not.toHaveBeenCalled();

    // Step 2: confirmLateCancellationAction performs the late cancellation
    vi.clearAllMocks();

    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sub: 'user-uuid-123',
      role: 'client',
      email: 'client@test.com',
    });

    (db.query.classEnrollments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: enrollmentId,
      openClassId: 'class-uuid-789',
      userSubscriptionId: subscriptionId,
      status: 'pending',
      createdAt: new Date(),
    });

    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'class-uuid-789',
      classDate,
      coachUserId: 'coach-uuid',
      capacity: 10,
      available: 'available',
      classType: 'mat_pilates',
      status: 'scheduled',
      createdAt: new Date(),
    });

    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({ set: mockSet });

    const confirmResult = await confirmLateCancellationAction(enrollmentId);

    // Should succeed with late_cancelled status set
    expect(confirmResult.success).toBe(true);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ status: 'late_cancelled' });

    // No transaction = no days_remaining increment
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
