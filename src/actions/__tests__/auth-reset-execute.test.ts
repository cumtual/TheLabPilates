import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { verifyPassword } from '@/lib/auth/password';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      passwordResets: { findFirst: vi.fn() },
    },
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
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

import { resetPasswordAction } from '../auth';
import { db } from '@/db';

// Helper: generate a valid password (8-72 chars)
const validPasswordArb = fc.string({ minLength: 8, maxLength: 72 }).filter(
  (s) => s.length >= 8 && s.length <= 72
);

/**
 * Property 8: Valid Token Reset Round-Trip
 *
 * For any valid (non-expired) Password_Reset_Token and new password of 8-72 characters,
 * submitting the reset SHALL result in the user's stored password being updated to a new
 * bcrypt/argon2 hash that verifies against the new plaintext password.
 *
 * Validates: Requirements 2.4
 */
describe('Property 8: Valid Token Reset Round-Trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('valid token + valid password results in updated hash that verifies', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validPasswordArb,
        async (tokenStr, userId, newPassword) => {
          // bcrypt is intentionally slow; this test uses real hashing
          vi.clearAllMocks();

          // Track what password hash was written
          let capturedHash: string | null = null;

          // Mock: token exists and is not expired (future expiry)
          (db.query.passwordResets.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'reset-id-123',
            userId,
            token: tokenStr,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
          });

          // Mock: db.update().set().where() — capture the hashed password
          const mockWhere = vi.fn().mockResolvedValue(undefined);
          const mockSet = vi.fn().mockImplementation((values: { password: string }) => {
            capturedHash = values.password;
            return { where: mockWhere };
          });
          (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

          // Mock: db.delete().where() for cleanup
          const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockDeleteWhere });

          const formData = new FormData();
          formData.set('password', newPassword);
          formData.set('confirmPassword', newPassword);

          const result = await resetPasswordAction(tokenStr, null, formData);

          // Action should succeed
          expect(result).toHaveProperty('success', true);

          // A new hash was saved
          expect(capturedHash).not.toBeNull();
          expect(capturedHash).not.toBe(newPassword); // Hash != plaintext

          // The stored hash verifies against the new password (real bcrypt)
          const isValid = await verifyPassword(newPassword, capturedHash!);
          expect(isValid).toBe(true);
        }
      ),
      { numRuns: 5 } // Low numRuns due to bcrypt cost
    );
  }, 30000);
});

/**
 * Property 9: Successful Reset Cleanup
 *
 * For any successful password reset, the password_resets table SHALL contain
 * zero records for that user_id after the operation completes.
 *
 * Validates: Requirements 2.6
 */
describe('Property 9: Successful Reset Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('after reset, db.delete is called for that user\'s tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validPasswordArb,
        async (tokenStr, userId, newPassword) => {
          // bcrypt is intentionally slow; this test uses real hashing
          vi.clearAllMocks();

          // Mock: valid, non-expired token
          (db.query.passwordResets.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'reset-id-456',
            userId,
            token: tokenStr,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          });

          // Mock: db.update().set().where()
          const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
          const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
          (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

          // Mock: db.delete().where() — track calls
          const deleteWhereCalls: unknown[] = [];
          const mockDeleteWhere = vi.fn().mockImplementation((...args: unknown[]) => {
            deleteWhereCalls.push(args);
            return Promise.resolve(undefined);
          });
          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockDeleteWhere });

          const formData = new FormData();
          formData.set('password', newPassword);
          formData.set('confirmPassword', newPassword);

          const result = await resetPasswordAction(tokenStr, null, formData);

          // Action should succeed
          expect(result).toHaveProperty('success', true);

          // db.delete was called (to remove all tokens for the user)
          expect(db.delete).toHaveBeenCalled();
          expect(mockDeleteWhere).toHaveBeenCalled();
        }
      ),
      { numRuns: 5 } // Low numRuns due to bcrypt cost
    );
  }, 30000);
});

/**
 * Property 10: Expired Token Blocks Reset
 *
 * For any Password_Reset_Token where expires_at < now or the token string does not
 * match any record in password_resets, attempting a password reset SHALL fail and
 * the user's stored password SHALL remain unchanged.
 *
 * Validates: Requirements 2.7
 */
describe('Property 10: Expired Token Blocks Reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalid token (not found) fails and db.update is NOT called', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validPasswordArb,
        async (tokenStr, newPassword) => {
          vi.clearAllMocks();

          // Mock: token NOT found in database
          (db.query.passwordResets.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

          // Mock db.update — should NOT be called
          const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
          const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
          (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

          // Mock db.delete
          const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockDeleteWhere });

          const formData = new FormData();
          formData.set('password', newPassword);
          formData.set('confirmPassword', newPassword);

          const result = await resetPasswordAction(tokenStr, null, formData);

          // Action should fail
          expect(result).toHaveProperty('success', false);

          // Password was NOT updated (db.update never called)
          expect(db.update).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('expired token fails and db.update is NOT called for password', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validPasswordArb,
        async (tokenStr, userId, newPassword) => {
          vi.clearAllMocks();

          // Mock: token found but EXPIRED (expiresAt in the past)
          (db.query.passwordResets.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'reset-id-expired',
            userId,
            token: tokenStr,
            expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
          });

          // Mock db.update — should NOT be called for password update
          const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
          const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
          (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

          // Mock db.delete — might be called for cleanup of expired token
          const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockDeleteWhere });

          const formData = new FormData();
          formData.set('password', newPassword);
          formData.set('confirmPassword', newPassword);

          const result = await resetPasswordAction(tokenStr, null, formData);

          // Action should fail
          expect(result).toHaveProperty('success', false);

          // Password was NOT updated (db.update never called for users table)
          expect(db.update).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });
});
