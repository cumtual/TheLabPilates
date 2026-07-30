// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { SignJWT } from 'jose';
import { signJWT, verifyJWT } from '../jwt';
import type { UserRole } from '@/lib/types';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
});

const roleArb = fc.constantFrom<UserRole>('client', 'coach', 'admin');

const emailArb = fc.emailAddress();

const uuidArb = fc.uuid();

/**
 * Property 3: JWT Claims and Expiration Correctness
 * For any valid auth payload, the issued JWT decodes to correct sub, role, and exp - iat = 3600
 *
 * **Validates: Requirements 1.3**
 */
describe('Property 3: JWT Claims and Expiration Correctness', () => {
  it('for any valid auth payload, issued JWT decodes with correct sub, role, and exp-iat = 3600', async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, roleArb, emailArb, async (sub, role, email) => {
        const token = await signJWT({ sub, role, email });
        const payload = await verifyJWT(token);

        expect(payload).not.toBeNull();
        expect(payload!.sub).toBe(sub);
        expect(payload!.role).toBe(role);
        expect(payload!.email).toBe(email);
        expect(payload!.exp - payload!.iat).toBe(3600);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 4: Expired JWT Rejection
 * For any JWT with exp <= now, verification returns null
 *
 * **Validates: Requirements 1.7**
 */
describe('Property 4: Expired JWT Rejection', () => {
  it('for any JWT with exp <= now, verifyJWT returns null', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        roleArb,
        emailArb,
        fc.integer({ min: 1, max: 86400 }),
        async (sub, role, email, secondsInPast) => {
          const now = Math.floor(Date.now() / 1000);
          const expiredAt = now - secondsInPast;

          // Create an already-expired token using jose directly
          const token = await new SignJWT({ sub, role, email } as unknown as Record<string, unknown>)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt(expiredAt - 3600)
            .setExpirationTime(expiredAt)
            .sign(secret);

          const result = await verifyJWT(token);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
