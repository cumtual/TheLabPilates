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
import { redirect } from 'next/navigation';

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

/**
 * Login with ?redirect= (QR check-in flow, TASK-QR-BE-09)
 *
 * A coach who scans a QR without a session is sent to /login?redirect=/check-in?token=…
 * and must land back on the check-in page after logging in. Only internal paths are
 * honored; anything else falls back to the role dashboard (no open redirect).
 */
describe('loginAction: safe post-login redirect', () => {
  let passwordHash: string;
  const token = 'a'.repeat(64);

  beforeEach(async () => {
    vi.clearAllMocks();
    passwordHash ??= await hashPassword('secret-password');
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'coach-1',
      email: 'coach@test.com',
      password: passwordHash,
      role: 'coach',
      emailVerified: true,
      deletedAt: null,
    });
  });

  function loginForm(redirectTo?: string) {
    const formData = new FormData();
    formData.set('email', 'coach@test.com');
    formData.set('password', 'secret-password');
    if (redirectTo !== undefined) formData.set('redirect', redirectTo);
    return formData;
  }

  it('returns to the check-in page after login', { timeout: 30000 }, async () => {
    await loginAction(null, loginForm(`/check-in?token=${token}`));
    expect(redirect).toHaveBeenCalledWith(`/check-in?token=${token}`);
  });

  it.each([undefined, '', '//evil.com', 'https://evil.com'])(
    'falls back to the role dashboard when redirect is %j',
    { timeout: 30000 },
    async (redirectTo) => {
      await loginAction(null, loginForm(redirectTo));
      expect(redirect).toHaveBeenCalledWith('/coach');
    }
  );
});
