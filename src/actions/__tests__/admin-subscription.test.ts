import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      userSubscriptions: {
        findFirst: vi.fn(),
      },
      subscriptions: {
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

import {
  suspendSubscriptionAction,
  refundSessionCreditAction,
  decrementSubscriptionCreditAction,
} from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

type TransactionCallback = (tx: {
  update: (...args: unknown[]) => unknown;
  execute: (...args: unknown[]) => unknown;
}) => Promise<void>;

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
          (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb: TransactionCallback) => {
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

/**
 * Suspension credit handling per plan type.
 *
 * Open Lab is time-based and has no per-session credits, so suspending it
 * must NOT increment days_remaining. Credit packages still refund each
 * cancelled future enrollment.
 */
describe('Suspension credits: Open Lab vs credit packages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSuspendDeps(plan: { guest: boolean }) {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sub: 'admin-uuid',
      role: 'admin',
      email: 'admin@test.com',
    });

    (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'sub-1',
      userId: 'client-uuid',
      subscriptionId: 'plan-1',
      active: true,
      daysRemaining: 2,
    });

    (db.query.subscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'plan-1',
      guest: plan.guest,
    });

    const mockWhere = vi
      .fn()
      .mockResolvedValue([{ enrollmentId: 'e1' }, { enrollmentId: 'e2' }]);
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const txOperations: { type: string; data?: unknown }[] = [];

    const mockTxUpdate = vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((setData: unknown) => ({
        where: vi.fn().mockImplementation(() => {
          txOperations.push({ type: 'update', data: setData });
          return Promise.resolve();
        }),
      })),
    }));

    const mockTxExecute = vi.fn().mockImplementation(() => {
      txOperations.push({ type: 'execute' });
      return Promise.resolve();
    });

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: TransactionCallback) => {
        await cb({ update: mockTxUpdate, execute: mockTxExecute });
      }
    );

    return txOperations;
  }

  it('does NOT increment days_remaining when suspending Open Lab', async () => {
    const txOperations = mockSuspendDeps({ guest: true });

    const result = await suspendSubscriptionAction('sub-1');

    expect(result).toHaveProperty('success', true);
    expect(txOperations.filter((op) => op.type === 'execute')).toHaveLength(0);
    expect(
      txOperations.filter(
        (op) => op.type === 'update' && (op.data as { status?: string }).status === 'cancelled'
      )
    ).toHaveLength(2);
  });

  it('increments days_remaining for each cancelled enrollment in credit packages', async () => {
    const txOperations = mockSuspendDeps({ guest: false });

    const result = await suspendSubscriptionAction('sub-1');

    expect(result).toHaveProperty('success', true);
    expect(txOperations.filter((op) => op.type === 'execute')).toHaveLength(2);
  });
});

/**
 * Admin credit decrement.
 *
 * Decrementing the last credit (days_remaining 1 → 0) MUST transition the
 * subscription to `expired` (active=false), never `suspended`. Open Lab,
 * zero/negative balances and already-expired subscriptions are rejected.
 */
describe('decrementSubscriptionCreditAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockAdminSession(role: string = 'admin') {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sub: 'admin-uuid',
      role,
      email: 'admin@test.com',
    });
  }

  function mockSubscription(overrides: Record<string, unknown> = {}) {
    (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'sub-1',
      userId: 'client-uuid',
      subscriptionId: 'plan-1',
      active: true,
      status: 'active',
      daysRemaining: 5,
      ...overrides,
    });
  }

  function mockPlan(guest: boolean) {
    (db.query.subscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'plan-1',
      guest,
    });
  }

  function mockDecrementTx(returningRow: { daysRemaining: number } | undefined) {
    const ops: { type: string; data?: unknown }[] = [];

    const mockTxUpdate = vi.fn().mockImplementation(() => {
      let capturedSet: Record<string, unknown> = {};
      return {
        set: vi.fn().mockImplementation((setData: Record<string, unknown>) => {
          capturedSet = setData;
          return {
            where: vi.fn().mockImplementation(() => {
              ops.push({ type: 'update', data: capturedSet });
              const base = Promise.resolve();
              return Object.assign(base, {
                returning: vi.fn().mockImplementation(() =>
                  Promise.resolve(returningRow === undefined ? [] : [returningRow])
                ),
              });
            }),
          };
        }),
      };
    });

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: TransactionCallback) => {
        return cb({ update: mockTxUpdate, execute: vi.fn() });
      }
    );

    return ops;
  }

  it('rejects when there is no session', async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-admin role', async () => {
    mockAdminSession('coach');

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown subscription', async () => {
    mockAdminSession();
    (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      undefined
    );

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects Open Lab (unlimited, no credits)', async () => {
    mockAdminSession();
    mockSubscription({ daysRemaining: 5 });
    mockPlan(true);

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects an already expired subscription', async () => {
    mockAdminSession();
    mockSubscription({ status: 'expired', active: false, daysRemaining: 3 });
    mockPlan(false);

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a subscription with zero credits', async () => {
    mockAdminSession();
    mockSubscription({ daysRemaining: 0 });
    mockPlan(false);

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('decrements credits and keeps status when credits remain', async () => {
    mockAdminSession();
    mockSubscription({ daysRemaining: 5 });
    mockPlan(false);
    const ops = mockDecrementTx({ daysRemaining: 4 });

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', true);
    expect((result as { data?: { daysRemaining?: number; expired?: boolean } }).data).toEqual({
      daysRemaining: 4,
      expired: false,
    });
    // Only the decrement update; no status/active mutation.
    expect(ops).toHaveLength(1);
    expect(ops[0].data).toHaveProperty('daysRemaining');
    expect(ops[0].data).not.toHaveProperty('status');
  });

  it('transitions to expired (never suspended) when the last credit is consumed', async () => {
    mockAdminSession();
    mockSubscription({ daysRemaining: 1 });
    mockPlan(false);
    const ops = mockDecrementTx({ daysRemaining: 0 });

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', true);
    expect((result as { data?: { daysRemaining?: number; expired?: boolean } }).data).toEqual({
      daysRemaining: 0,
      expired: true,
    });
    expect(ops).toHaveLength(2);
    const expireUpdate = ops[1].data as Record<string, unknown>;
    expect(expireUpdate.status).toBe('expired');
    expect(expireUpdate.active).toBe(false);
    expect(expireUpdate.expirationDate).toBeInstanceOf(Date);
    expect(expireUpdate.status).not.toBe('suspended');
  });

  it('rolls back with an error when the guarded update matches nothing (race)', async () => {
    mockAdminSession();
    mockSubscription({ daysRemaining: 1 });
    mockPlan(false);
    const ops = mockDecrementTx(undefined);

    const result = await decrementSubscriptionCreditAction('sub-1');

    expect(result).toHaveProperty('success', false);
    // No expired transition happened.
    expect(ops).toHaveLength(1);
  });
});
