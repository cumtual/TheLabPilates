import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      userSubscriptions: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
    transaction: vi.fn(),
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
  sendClassCancellationEmail: vi.fn(),
}));

import { suspendSubscriptionAction, refundSessionCreditAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Property 28: Subscription Suspension Cascade
 *
 * For any subscription suspension, the system SHALL set active = false,
 * cancel all future pending enrollments linked to that subscription, and
 * increment the client's days_remaining by the count of cancelled enrollments.
 *
 * **Validates: Requirements 11.3**
 */
describe('Property 28: Subscription Suspension Cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suspension: active=false, future enrollments cancelled, days_remaining += cancelled count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // subscriptionId
        fc.array(
          fc.record({
            enrollmentId: fc.uuid(),
          }),
          { minLength: 0, maxLength: 10 }
        ), // future pending enrollments
        fc.integer({ min: 0, max: 100 }), // pre_days_remaining
        async (subscriptionId, futureEnrollments, preDaysRemaining) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'admin-uuid',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock active subscription
          (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: subscriptionId,
            userId: 'client-uuid',
            active: true,
            daysRemaining: preDaysRemaining,
          });

          // Mock db.select().from().innerJoin().where() for future pending enrollments
          const mockWhere = vi.fn().mockResolvedValue(
            futureEnrollments.map((e) => ({
              enrollmentId: e.enrollmentId,
            }))
          );
          const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
          const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
          (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

          // Track transaction operations
          const txOperations: { type: string; data: unknown }[] = [];

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

          const result = await suspendSubscriptionAction(subscriptionId);

          // Action should succeed
          expect(result).toHaveProperty('success', true);

          // Transaction was called exactly once
          expect(db.transaction).toHaveBeenCalledTimes(1);

          const N = futureEnrollments.length;

          // First operation: set subscription active=false
          expect(txOperations[0].type).toBe('update');
          const subUpdate = txOperations[0].data as Record<string, unknown>;
          expect(subUpdate.active).toBe(false);

          // For each future enrollment: 2 operations (update status to cancelled + execute for days_remaining)
          // Total operations = 1 (active=false) + N * 2 (each: update cancelled + execute increment)
          expect(txOperations.length).toBe(1 + N * 2);

          // Verify each enrollment gets status 'cancelled' and days_remaining incremented
          for (let i = 0; i < N; i++) {
            const updateOp = txOperations[1 + i * 2];
            const executeOp = txOperations[1 + i * 2 + 1];

            // enrollment status update to 'cancelled'
            expect(updateOp.type).toBe('update');
            const enrollUpdate = updateOp.data as Record<string, unknown>;
            expect(enrollUpdate.status).toBe('cancelled');

            // days_remaining increment via SQL execute
            expect(executeOp.type).toBe('execute');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 29: Manual Refund With Active Subscription Guard
 *
 * For any manual session credit refund, the operation SHALL succeed
 * (incrementing days_remaining by 1) only if the client has an active
 * subscription (active = true). Without an active subscription, the
 * operation SHALL fail with no changes.
 *
 * **Validates: Requirements 11.4, 11.5**
 */
describe('Property 29: Manual Refund With Active Subscription Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('active subscription exists → success + execute called', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        fc.uuid(), // subscriptionId
        fc.integer({ min: 0, max: 100 }), // pre_days_remaining
        async (userId, subscriptionId, preDaysRemaining) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'admin-uuid',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock active subscription exists for user
          (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: subscriptionId,
            userId,
            active: true,
            daysRemaining: preDaysRemaining,
          });

          // Mock db.execute for the increment
          (db.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

          const result = await refundSessionCreditAction(userId);

          // Action should succeed
          expect(result).toHaveProperty('success', true);

          // db.execute should have been called to increment days_remaining
          expect(db.execute).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('no active subscription → failure + no execute', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        async (userId) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'admin-uuid',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock no active subscription found
          (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
            undefined
          );

          const result = await refundSessionCreditAction(userId);

          // Action should fail
          expect(result).toHaveProperty('success', false);

          // No execute should be called (no changes made)
          expect(db.execute).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
