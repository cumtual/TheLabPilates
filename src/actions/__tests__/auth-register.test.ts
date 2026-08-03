import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
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
  createSession: vi.fn(),
}));

vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('$2a$12$mockedhash'),
  verifyPassword: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/email/service', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendClassCancellationEmail: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import { registerAction } from '../auth';
import { db } from '@/db';

/**
 * Property 2: Duplicate Email Rejection
 * For any email address that already exists in the users table,
 * attempting registration with the same email SHALL be rejected
 * and the users table row count SHALL remain unchanged.
 *
 * **Validates: Requirements 1.2**
 */
describe('Duplicate Email Rejection (Property 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registering with an existing email is rejected and insert is never called', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.string({ minLength: 8, maxLength: 72 }),
        async (email, username, password) => {
          // Simulate existing user with this email
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            id: 'existing-uuid',
            email: email.toLowerCase(),
            username: 'existing',
            password: 'hashed',
            role: 'client',
          });

          const formData = new FormData();
          formData.set('username', username);
          formData.set('email', email);
          formData.set('password', password);
          formData.set('confirmPassword', password);

          const result = await registerAction(null, formData);

          // Registration should be rejected
          expect(result).toHaveProperty('success', false);
          if (!result.success) {
            expect(result.field).toBe('email');
          }

          // db.insert should NOT have been called (user count unchanged)
          expect(db.insert).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
