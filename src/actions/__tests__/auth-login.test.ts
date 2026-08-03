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
}));

vi.mock('@/lib/email/service', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendClassCancellationEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

// Mock redirect to not throw
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

import { loginAction } from '../auth';
import { db } from '@/db';
import { hashPassword } from '@/lib/auth/password';

/**
 * Property 5: Generic Error on Invalid Credentials
 *
 * For any login attempt with either a non-existent email or an incorrect password,
 * the returned error message SHALL be identical regardless of which condition
 * triggered the failure.
 *
 * Validates: Requirements 1.5
 */
describe('Property 5: Generic Error on Invalid Credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('error message is identical whether email does not exist or password is wrong', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.string({ minLength: 8, maxLength: 72 }),
        fc.string({ minLength: 8, maxLength: 72 }),
        async (email, correctPassword, wrongPassword) => {
          // Ensure wrongPassword differs from correctPassword
          fc.pre(wrongPassword !== correctPassword);

          const hashedCorrectPassword = await hashPassword(correctPassword);

          // Case 1: Email doesn't exist (user not found)
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
          const formData1 = new FormData();
          formData1.set('email', email);
          formData1.set('password', wrongPassword);
          const result1 = await loginAction(null, formData1);

          // Case 2: Email exists but password is wrong
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'some-uuid',
            email: email.toLowerCase(),
            password: hashedCorrectPassword,
            role: 'client',
          });
          const formData2 = new FormData();
          formData2.set('email', email);
          formData2.set('password', wrongPassword);
          const result2 = await loginAction(null, formData2);

          // Both should fail with identical error messages
          expect(result1).toHaveProperty('success', false);
          expect(result2).toHaveProperty('success', false);
          if (!result1.success && !result2.success) {
            expect(result1.error).toBe(result2.error);
          }
        }
      ),
      { numRuns: 5 } // bcrypt is slow, keep runs low
    );
  });
});
