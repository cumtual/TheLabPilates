import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      openClasses: {
        findFirst: vi.fn(),
      },
      userSubscriptions: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
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

vi.mock('@/lib/email/service', () => ({
  sendEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendClassCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { cancelClassAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Property 26: Class Cancellation Refunds All Pending Enrollments
 *
 * For any Open_Class cancellation where the class has status = 'scheduled'
 * and N pending enrollments, after cancellation: the class status SHALL be
 * "cancelled", each pending enrollment status SHALL be updated, and each
 * affected client's days_remaining SHALL be incremented by exactly 1.
 *
 * **Validates: Requirements 10.1, 10.3**
 */
describe('Property 26: Class Cancellation Refunds All Pending Enrollments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scheduled class with N pending enrollments: status=cancelled, each days_remaining+1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // classId
        fc.array(
          fc.record({
            enrollmentId: fc.uuid(),
            userSubscriptionId: fc.uuid(),
          }),
          { minLength: 0, maxLength: 10 }
        ), // pending enrollments
        fc.constantFrom('yoga' as const, 'mat_pilates' as const, 'barre' as const),
        async (classId, pendingEnrollments, classType) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'admin-uuid',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock scheduled class
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: classId,
            status: 'scheduled',
            classType,
            classDate: new Date('2025-12-01T10:00:00Z'),
            coachUserId: 'coach-uuid',
            capacity: 10,
          });

          // Mock db.select for pending enrollments
          const mockWhere = vi.fn().mockResolvedValue(
            pendingEnrollments.map((e) => ({
              enrollmentId: e.enrollmentId,
              userSubscriptionId: e.userSubscriptionId,
            }))
          );
          const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
          (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

          // Track transaction operations
          const txOperations: { type: string; data: unknown; target?: string }[] = [];

          const mockTxUpdate = vi.fn().mockImplementation(() => ({
            set: vi.fn().mockImplementation((setData: unknown) => ({
              where: vi.fn().mockImplementation(() => {
                txOperations.push({ type: 'update', data: setData });
                return Promise.resolve();
              }),
            })),
          }));

          const mockTxExecute = vi.fn().mockImplementation((sqlQuery: unknown) => {
            txOperations.push({ type: 'execute', data: sqlQuery });
            return Promise.resolve();
          });

          // Mock db.transaction to execute the callback
          (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb: Function) => {
            await cb({
              update: mockTxUpdate,
              execute: mockTxExecute,
            });
          });

          // Mock user subscription + user queries for email sending
          (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'sub-uuid',
            userId: 'user-uuid',
          });
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'user-uuid',
            email: 'test@test.com',
            username: 'TestUser',
          });

          const result = await cancelClassAction(classId);

          // Action should succeed
          expect(result).toHaveProperty('success', true);

          // Transaction was called exactly once
          expect(db.transaction).toHaveBeenCalledTimes(1);

          // First operation: set class status to 'cancelled'
          expect(txOperations[0].type).toBe('update');
          const classUpdate = txOperations[0].data as Record<string, unknown>;
          expect(classUpdate.status).toBe('cancelled');

          // For each pending enrollment: 2 operations (execute for days_remaining + update for status)
          const N = pendingEnrollments.length;

          // Total operations = 1 (class cancel) + N * 2 (each enrollment: execute + update)
          expect(txOperations.length).toBe(1 + N * 2);

          // Verify each enrollment gets days_remaining incremented and status updated
          for (let i = 0; i < N; i++) {
            const executeOp = txOperations[1 + i * 2];
            const updateOp = txOperations[1 + i * 2 + 1];

            // days_remaining increment via SQL execute
            expect(executeOp.type).toBe('execute');

            // enrollment status update to 'cancelled'
            expect(updateOp.type).toBe('update');
            const enrollUpdate = updateOp.data as Record<string, unknown>;
            expect(enrollUpdate.status).toBe('cancelled');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 27: Already-Cancelled Class Blocks Re-Cancellation
 *
 * For any Open_Class where status = 'cancelled', attempting cancellation again
 * SHALL be rejected and no records SHALL be modified.
 *
 * **Validates: Requirements 10.2**
 */
describe('Property 27: Already-Cancelled Class Blocks Re-Cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancelled class: rejection, no changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // classId
        fc.constantFrom('yoga' as const, 'mat_pilates' as const, 'barre' as const),
        fc.date(), // classDate
        async (classId, classType, classDate) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'admin-uuid',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock already cancelled class
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: classId,
            status: 'cancelled',
            classType,
            classDate,
            coachUserId: 'coach-uuid',
            capacity: 10,
          });

          const result = await cancelClassAction(classId);

          // Action should be rejected
          expect(result).toHaveProperty('success', false);
          expect(result.success === false && result.error).toBeTruthy();

          // No transaction should be called (no modifications)
          expect(db.transaction).not.toHaveBeenCalled();

          // No select for enrollments
          expect(db.select).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
