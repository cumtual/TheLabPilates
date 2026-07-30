import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { hashPassword, verifyPassword } from '../password';

/**
 * Property 1: Password Storage Invariant
 * For any password, stored hash never equals plaintext and bcrypt.compare verifies correctly.
 *
 * **Validates: Requirements 1.1, 1.8**
 */
describe('Password Storage (Property 1)', () => {
  it('stored hash never equals plaintext and verifies correctly', async () => {
    // bcrypt cost 12 is intentionally slow (~250ms per hash), so we need a generous timeout
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 72 }),
        async (password) => {
          const hash = await hashPassword(password);

          // Hash never equals plaintext
          expect(hash).not.toBe(password);

          // Hash verifies against original password
          const isValid = await verifyPassword(password, hash);
          expect(isValid).toBe(true);

          // Hash does NOT verify against a different password
          const wrongPassword = password + 'x';
          const isInvalid = await verifyPassword(wrongPassword, hash);
          expect(isInvalid).toBe(false);
        }
      ),
      { numRuns: 10 } // bcrypt cost 12 is slow, keep runs low
    );
  }, 30000); // 30s timeout for bcrypt property test
});
