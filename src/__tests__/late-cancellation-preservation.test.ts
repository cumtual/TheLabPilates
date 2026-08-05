// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Preservation Property Tests - Late Cancellation Bugfix
 *
 * These tests verify that existing behavior is PRESERVED after the bugfix:
 * 1. Timely cancellations (≥24h) still delete enrollment + refund credit
 * 2. Unauthenticated/non-client requests are still rejected
 * 3. Non-pending enrollments are still blocked
 * 4. Past class cancellations are still blocked
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
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

import { cancelReservationAction } from '@/actions/enrollment';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

// Helper to create a future date N hours ahead from now
function futureDateHoursAhead(hours: number): Date {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d;
}

// Helper to create a past date
function pastDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/**
 * Property-based test 1 - Timely Cancellation Preservation
 *
 * For all `hoursUntilClass` values in [25, 168], `cancelReservationAction` calls
 * `db.transaction` with delete + increment `days_remaining` and returns
 * `{ success: true }` with message containing "crédito"
 *
 * **Validates: Requirements 3.1**
 */
describe('Preservation Property 1: Timely Cancellation Still Refunds Credit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for hoursUntilClass in [25, 168]: transaction with delete + increment, returns success with "crédito"', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 25, max: 168 }),
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

          // Timely cancellation should succeed
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.message).toContain('crédito');
          }

          // Transaction must have been called
          expect(db.transaction).toHaveBeenCalledTimes(1);

          // Both delete (enrollment) and execute (increment days_remaining) must be called
          expect(txDeleteCalled).toBe(true);
          expect(txExecuteCalled).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Property-based test 2 - Auth Block Preservation
 *
 * For unauthenticated users (no session) and non-client roles,
 * `cancelReservationAction` returns `{ success: false }` with appropriate error
 * and makes no DB modifications.
 *
 * **Validates: Requirements 3.2**
 */
describe('Preservation Property 2: Auth Block Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unauthenticated users get "No autenticado." with no DB modifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (enrollmentId) => {
          vi.clearAllMocks();

          // Mock no session (unauthenticated)
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

          const result = await cancelReservationAction(enrollmentId);

          // Must be rejected
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('No autenticado.');
          }

          // No database modifications
          expect(db.transaction).not.toHaveBeenCalled();
          expect(db.update).not.toHaveBeenCalled();
          expect(db.delete).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });

  it('non-client roles get "No tienes permisos" with no DB modifications', async () => {
    const nonClientRoles = fc.constantFrom('admin', 'coach');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        nonClientRoles,
        async (enrollmentId, role) => {
          vi.clearAllMocks();

          // Mock session with non-client role
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role,
            email: 'user@test.com',
          });

          const result = await cancelReservationAction(enrollmentId);

          // Must be rejected
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('No tienes permisos para esta acción.');
          }

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

/**
 * Property-based test 3 - Non-Pending Block Preservation
 *
 * For enrollments with status in ['attended', 'absent', 'late_cancelled'],
 * `cancelReservationAction` returns `{ success: false }` and makes no DB modifications.
 *
 * **Validates: Requirements 3.3**
 */
describe('Preservation Property 3: Non-Pending Block Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('non-pending enrollment statuses are blocked with no DB modifications', async () => {
    const nonPendingStatuses = fc.constantFrom('attended', 'absent', 'late_cancelled');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        nonPendingStatuses,
        async (enrollmentId, subscriptionId, status) => {
          vi.clearAllMocks();

          // Mock authenticated client session
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
          if (!result.success) {
            expect(result.error).toBe('Solo puedes cancelar reservaciones pendientes.');
          }

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

/**
 * Property-based test 4 - Past Class Block Preservation
 *
 * For classes with `classDate` in the past, `cancelReservationAction` returns
 * error "No puedes cancelar una clase que ya pasó." and makes no DB modifications.
 *
 * **Validates: Requirements 3.4**
 */
describe('Preservation Property 4: Past Class Block Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('past class cancellations return "ya pasó" error with no DB modifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 30 }), // days in the past
        async (enrollmentId, subscriptionId, daysAgo) => {
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
          if (!result.success) {
            expect(result.error).toBe('No puedes cancelar una clase que ya pasó.');
          }

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
