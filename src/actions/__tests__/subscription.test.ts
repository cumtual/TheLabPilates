import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      userSubscriptions: {
        findMany: vi.fn(),
      },
      payments: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/email/service', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendClassCancellationEmail: vi.fn(),
  sendEmail: vi.fn(),
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

import { purchaseSubscriptionAction } from '../subscription';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Property 13: Payment Record Creation
 *
 * For any subscription purchase with payment method "transfer" or "cash",
 * the system SHALL create a Payment record with the matching payment_type
 * and confirmed = false, and a linked user_subscriptions record with
 * active = false and expiration_date = null.
 *
 * **Validates: Requirements 5.2, 5.3, 5.5**
 */
describe('Property 13: Payment Record Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transfer/cash purchase creates Payment with confirmed=false and linked user_subscriptions with active=false, expiration_date=null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom('transfer' as const, 'cash' as const),
        async (subscriptionId, paymentType) => {
          // Reset mocks on each iteration
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // No existing pending payments — findMany returns empty
          (db.query.userSubscriptions.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

          // Track insert calls
          const insertedPaymentValues: unknown[] = [];
          const insertedSubscriptionValues: unknown[] = [];
          let insertCallCount = 0;

          const mockReturning = vi.fn().mockResolvedValue([{
            id: 'new-payment-uuid',
            paymentType,
            confirmed: false,
            dateConfirmed: null,
            createdAt: new Date(),
          }]);

          const mockValuesFirst = vi.fn((values: unknown) => {
            insertedPaymentValues.push(values);
            return { returning: mockReturning };
          });

          const mockValuesSecond = vi.fn((values: unknown) => {
            insertedSubscriptionValues.push(values);
            return { returning: vi.fn().mockResolvedValue([]) };
          });

          (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
            insertCallCount++;
            if (insertCallCount === 1) {
              return { values: mockValuesFirst };
            }
            return { values: mockValuesSecond };
          });

          const result = await purchaseSubscriptionAction(subscriptionId, paymentType);

          // Action should succeed
          expect(result).toHaveProperty('success', true);

          // db.insert was called exactly 2 times (once for payment, once for userSubscription)
          expect(db.insert).toHaveBeenCalledTimes(2);

          // Verify payment was created with confirmed=false and correct paymentType
          expect(insertedPaymentValues.length).toBe(1);
          const paymentInsert = insertedPaymentValues[0] as Record<string, unknown>;
          expect(paymentInsert.paymentType).toBe(paymentType);
          expect(paymentInsert.confirmed).toBe(false);

          // Verify user_subscription was created with active=false and expirationDate=null
          expect(insertedSubscriptionValues.length).toBe(1);
          const subInsert = insertedSubscriptionValues[0] as Record<string, unknown>;
          expect(subInsert.active).toBe(false);
          expect(subInsert.expirationDate).toBeNull();
          expect(subInsert.subscriptionId).toBe(subscriptionId);
          expect(subInsert.userId).toBe('user-uuid-123');
          expect(subInsert.paymentId).toBe('new-payment-uuid');
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 14: Pending Payment Blocks New Purchase
 *
 * For any client who has an existing Payment record where confirmed = false,
 * attempting a new subscription purchase SHALL be rejected and no new Payment
 * or user_subscriptions records SHALL be created.
 *
 * **Validates: Requirements 5.6**
 */
describe('Property 14: Pending Payment Blocks New Purchase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('client with unconfirmed payment cannot create new purchase', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom('transfer' as const, 'cash' as const),
        fc.uuid(),
        async (subscriptionId, paymentType, existingPaymentId) => {
          // Reset mocks on each iteration
          vi.clearAllMocks();

          // Mock authenticated session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: 'user-uuid-123',
            role: 'client',
            email: 'client@test.com',
          });

          // Existing user subscription with unconfirmed payment
          (db.query.userSubscriptions.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            {
              id: 'existing-sub-uuid',
              paymentId: existingPaymentId,
              subscriptionId: 'some-sub-id',
              userId: 'user-uuid-123',
              active: false,
              daysRemaining: 0,
              expirationDate: null,
            },
          ]);

          // The linked payment is unconfirmed
          (db.query.payments.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: existingPaymentId,
            paymentType: 'transfer',
            confirmed: false,
            dateConfirmed: null,
          });

          const result = await purchaseSubscriptionAction(subscriptionId, paymentType);

          // Action should be rejected
          expect(result).toHaveProperty('success', false);

          // db.insert should NOT have been called
          expect(db.insert).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
