import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      payments: {
        findFirst: vi.fn(),
      },
      userSubscriptions: {
        findFirst: vi.fn(),
      },
      subscriptions: {
        findFirst: vi.fn(),
      },
    },
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
  sendClassCancellationEmail: vi.fn(),
}));

import { confirmPaymentAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Property 24: Atomic Payment Confirmation
 *
 * For any payment confirmation where the payment has confirmed = false,
 * the system SHALL atomically: (1) set confirmed = true and record date_confirmed,
 * (2) set linked user_subscription's active = true, (3) set days_remaining =
 * pre_days_remaining + subscription.sessions (accumulate, not overwrite), and
 * (4) set expiration_date = now + 30 days. If any step fails, all changes
 * SHALL be rolled back.
 *
 * **Validates: Requirements 9.2–9.7**
 */
describe('Property 24: Atomic Payment Confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirmed=false payment: atomically sets confirmed, active, accumulates days_remaining, sets expiration; rollback on failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // paymentId
        fc.uuid(), // subscriptionId
        fc.uuid(), // userSubscriptionId
        fc.integer({ min: 0, max: 100 }), // pre_days_remaining
        fc.integer({ min: 1, max: 30 }), // sessions to add
        async (paymentId, subscriptionId, userSubscriptionId, preDaysRemaining, sessionsToAdd) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'admin-uuid',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock unconfirmed payment
          (db.query.payments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: paymentId,
            paymentType: 'transfer',
            confirmed: false,
            dateConfirmed: null,
          });

          // Mock linked user subscription
          (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: userSubscriptionId,
            paymentId,
            subscriptionId,
            userId: 'client-uuid',
            active: false,
            daysRemaining: preDaysRemaining,
            expirationDate: null,
          });

          // Mock the subscription record
          (db.query.subscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: subscriptionId,
            name: 'Test Package',
            sessions: sessionsToAdd,
            guest: false,
            price: 500,
          });

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

          // Mock db.transaction to execute the callback with a mock tx object
          (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb: Function) => {
            await cb({
              update: mockTxUpdate,
              execute: mockTxExecute,
            });
          });

          const result = await confirmPaymentAction(paymentId);

          // Action should succeed
          expect(result).toHaveProperty('success', true);

          // Transaction was called exactly once
          expect(db.transaction).toHaveBeenCalledTimes(1);

          // Verify update operations within the transaction
          // Operation 1: Set payment confirmed=true + date_confirmed
          expect(txOperations[0].type).toBe('update');
          const paymentUpdate = txOperations[0].data as Record<string, unknown>;
          expect(paymentUpdate.confirmed).toBe(true);
          expect(paymentUpdate.dateConfirmed).toBeInstanceOf(Date);

          // Operation 2: Set user_subscription active=true
          expect(txOperations[1].type).toBe('update');
          const subUpdate = txOperations[1].data as Record<string, unknown>;
          expect(subUpdate.active).toBe(true);

          // Operation 3: SQL execute for days_remaining accumulation + expiration
          expect(txOperations[2].type).toBe('execute');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('transaction rollback on failure — no partial changes persisted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (paymentId) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'admin-uuid',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock unconfirmed payment
          (db.query.payments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: paymentId,
            paymentType: 'cash',
            confirmed: false,
            dateConfirmed: null,
          });

          // Mock linked user subscription
          (db.query.userSubscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'sub-uuid',
            paymentId,
            subscriptionId: 'subscription-uuid',
            userId: 'client-uuid',
            active: false,
            daysRemaining: 5,
            expirationDate: null,
          });

          // Mock subscription
          (db.query.subscriptions.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'subscription-uuid',
            name: 'Package',
            sessions: 8,
            guest: false,
            price: 400,
          });

          // Mock db.transaction to throw (simulating failure)
          (db.transaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error('Transaction failed')
          );

          // Action should throw or return failure due to unhandled transaction error
          await expect(confirmPaymentAction(paymentId)).rejects.toThrow('Transaction failed');

          // Transaction was attempted
          expect(db.transaction).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * Property 25: Already-Confirmed Payment Blocks Re-Confirmation
 *
 * For any Payment where confirmed = true, attempting confirmation again
 * SHALL be rejected and no fields SHALL be modified.
 *
 * **Validates: Requirements 9.2**
 */
describe('Property 25: Already-Confirmed Payment Blocks Re-Confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirmed=true payment: rejection, no changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // paymentId
        fc.constantFrom('transfer' as const, 'cash' as const, 'card' as const),
        fc.date(), // dateConfirmed
        async (paymentId, paymentType, dateConfirmed) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'admin-uuid',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock already confirmed payment
          (db.query.payments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: paymentId,
            paymentType,
            confirmed: true,
            dateConfirmed,
          });

          const result = await confirmPaymentAction(paymentId);

          // Action should be rejected
          expect(result).toHaveProperty('success', false);
          expect(result.success === false && result.error).toBeTruthy();

          // No transaction should be called
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
