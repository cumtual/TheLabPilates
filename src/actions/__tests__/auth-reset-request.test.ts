import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
    delete: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  createSession: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limiter', () => ({
  loginRateLimiter: {
    isRateLimited: vi.fn().mockReturnValue(false),
    recordAttempt: vi.fn(),
    reset: vi.fn(),
  },
  passwordResetRateLimiter: {
    isRateLimited: vi.fn().mockReturnValue(false),
    recordAttempt: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('@/lib/email/service', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
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

import { requestPasswordResetAction } from '../auth';
import { db } from '@/db';

/**
 * Property 6: Password Reset Generic Response
 *
 * For any email address submitted to the password reset endpoint
 * (whether it exists in the database or not), the response message SHALL be identical.
 *
 * Validates: Requirements 2.1
 */
describe('Property 6: Password Reset Generic Response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('response message is identical whether email exists or not', async () => {
    // Set up db.delete and db.insert mocks for existing user flow
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockResolvedValue(undefined);

    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        async (email) => {
          vi.clearAllMocks();

          // Reset mocks for each iteration
          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere.mockResolvedValue(undefined) });
          (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues.mockResolvedValue(undefined) });

          // Case 1: Email does NOT exist in the system
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

          const formData1 = new FormData();
          formData1.set('email', email);
          const result1 = await requestPasswordResetAction(null, formData1);

          // Case 2: Email EXISTS in the system
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'user-uuid-123',
            email: email.toLowerCase(),
            password: 'hashed-password',
            role: 'client',
          });

          const formData2 = new FormData();
          formData2.set('email', email);
          const result2 = await requestPasswordResetAction(null, formData2);

          // Both responses should be successful with identical messages
          expect(result1).toHaveProperty('success', true);
          expect(result2).toHaveProperty('success', true);

          if (result1.success && result2.success) {
            expect(result1.message).toBe(result2.message);
            // Also verify the message is not empty
            expect(result1.message).toBeTruthy();
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * Property 7: Password Reset Token Lifecycle
 *
 * For any user requesting a password reset, after the operation completes
 * there SHALL exist exactly one record in password_resets for that user_id
 * with expires_at ≈ now + 60 minutes, and any previously existing tokens
 * for that user SHALL have been deleted.
 *
 * Validates: Requirements 2.2
 */
describe('Property 7: Password Reset Token Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('after reset request, old tokens are deleted and exactly one new token is created', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.uuid(),
        async (email, userId) => {
          vi.clearAllMocks();

          // Track delete and insert calls
          const deleteCalls: Array<{ table: unknown; userId: string }> = [];
          const insertCalls: Array<{ table: unknown; values: unknown }> = [];

          const mockWhere = vi.fn().mockImplementation((..._args: unknown[]) => {
            deleteCalls.push({ table: 'passwordResets', userId });
            return Promise.resolve(undefined);
          });
          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere });

          const mockValues = vi.fn().mockImplementation((values: unknown) => {
            insertCalls.push({ table: 'passwordResets', values });
            return Promise.resolve(undefined);
          });
          (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

          // User exists in the system
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: userId,
            email: email.toLowerCase(),
            password: 'hashed-password',
            role: 'client',
          });

          const formData = new FormData();
          formData.set('email', email);
          const beforeRequest = Date.now();
          const result = await requestPasswordResetAction(null, formData);
          const afterRequest = Date.now();

          // Verify the action succeeded
          expect(result).toHaveProperty('success', true);

          // Verify old tokens were deleted (db.delete was called)
          expect(db.delete).toHaveBeenCalledTimes(1);
          expect(mockWhere).toHaveBeenCalledTimes(1);

          // Verify exactly one new token was inserted
          expect(db.insert).toHaveBeenCalledTimes(1);
          expect(mockValues).toHaveBeenCalledTimes(1);

          // Verify the inserted token has correct structure
          const insertedValues = mockValues.mock.calls[0][0] as {
            userId: string;
            token: string;
            expiresAt: Date;
          };

          // userId matches
          expect(insertedValues.userId).toBe(userId);

          // Token is a non-empty string (UUID format)
          expect(insertedValues.token).toBeTruthy();
          expect(typeof insertedValues.token).toBe('string');

          // expiresAt is approximately now + 60 minutes (within a 5-second tolerance)
          const expectedExpiry = 60 * 60 * 1000; // 60 minutes in ms
          const expiresAtMs = insertedValues.expiresAt.getTime();
          const lowerBound = beforeRequest + expectedExpiry - 5000;
          const upperBound = afterRequest + expectedExpiry + 5000;
          expect(expiresAtMs).toBeGreaterThanOrEqual(lowerBound);
          expect(expiresAtMs).toBeLessThanOrEqual(upperBound);
        }
      ),
      { numRuns: 20 }
    );
  });
});
