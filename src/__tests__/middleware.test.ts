// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const TEST_SECRET = 'test-secret-key-at-least-32-characters-long!!';
const BASE_URL = 'http://localhost:3000';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

type Role = 'client' | 'coach' | 'admin';

const roleArb = fc.constantFrom<Role>('client', 'coach', 'admin');

// Generate a valid sub-path segment (no slashes, URL-safe)
const pathSegmentArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
    minLength: 1,
    maxLength: 12,
  })
  .map((chars) => chars.join(''));

// Create a valid JWT for a given role
async function createToken(role: Role, sub?: string, email?: string): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SECRET);
  return new SignJWT({
    sub: sub ?? '550e8400-e29b-41d4-a716-446655440000',
    role,
    email: email ?? 'test@example.com',
  } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

// Create a NextRequest with a session cookie
function createRequest(path: string, token?: string): NextRequest {
  const url = new URL(path, BASE_URL);
  const req = new NextRequest(url);
  if (token) {
    req.cookies.set('session', token);
  }
  return req;
}

// Determine if a response is a redirect
function isRedirect(response: ReturnType<typeof middleware>): boolean {
  return response instanceof Response && (response.status === 307 || response.status === 308);
}

// Get redirect location from response
function getRedirectLocation(response: Response): string | null {
  return response.headers.get('location');
}

/**
 * Permission matrix: each role can only access its own portal prefix.
 */
const roleToPrefix: Record<Role, string> = {
  client: '/client',
  coach: '/coach',
  admin: '/admin',
};

/**
 * Property 11: Role-Based Access Control
 * For any (user_role, route_or_operation) pair, access SHALL be granted if and only if
 * the role has explicit permission for that route prefix.
 * - "client" accesses only `/client/*`
 * - "coach" accesses only `/coach/*`
 * - "admin" accesses only `/admin/*`
 * Unauthorized attempts SHALL redirect to the user's correct portal.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.7, 14.4**
 */
describe('Property 11: Role-Based Access Control', () => {
  it('access is granted iff the role matches the route prefix', async () => {
    await fc.assert(
      fc.asyncProperty(
        roleArb,
        fc.constantFrom<Role>('client', 'coach', 'admin'),
        pathSegmentArb,
        async (userRole, routePortal, subPath) => {
          const token = await createToken(userRole);
          const routePrefix = roleToPrefix[routePortal];
          const fullPath = `${routePrefix}/${subPath}`;
          const req = createRequest(fullPath, token);

          const response = await middleware(req);

          if (userRole === routePortal) {
            // Access should be GRANTED — no redirect (NextResponse.next())
            // NextResponse.next() returns a response without a Location header
            const location = response.headers.get('location');
            expect(location).toBeNull();
          } else {
            // Access should be DENIED — redirect to user's own portal
            const location = response.headers.get('location');
            expect(location).not.toBeNull();
            const redirectUrl = new URL(location!);
            expect(redirectUrl.pathname).toBe(roleToPrefix[userRole]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('unauthenticated access to any protected route redirects to /login', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Role>('client', 'coach', 'admin'),
        pathSegmentArb,
        async (routePortal, subPath) => {
          const routePrefix = roleToPrefix[routePortal];
          const fullPath = `${routePrefix}/${subPath}`;
          const req = createRequest(fullPath); // No token

          const response = await middleware(req);

          const location = response.headers.get('location');
          expect(location).not.toBeNull();
          const redirectUrl = new URL(location!);
          expect(redirectUrl.pathname).toBe('/login');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('authenticated user on an auth page redirects to their portal dashboard', async () => {
    await fc.assert(
      fc.asyncProperty(
        roleArb,
        fc.constantFrom('/login', '/register', '/reset-password'),
        async (userRole, authPath) => {
          const token = await createToken(userRole);
          const req = createRequest(authPath, token);

          const response = await middleware(req);

          const location = response.headers.get('location');
          expect(location).not.toBeNull();
          const redirectUrl = new URL(location!);
          expect(redirectUrl.pathname).toBe(roleToPrefix[userRole]);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('authenticated user on the landing page ("/") stays on the landing page', async () => {
    await fc.assert(
      fc.asyncProperty(roleArb, async (userRole) => {
        const token = await createToken(userRole);
        const req = createRequest('/', token);

        const response = await middleware(req);

        // No redirect: the public landing page must remain accessible when logged in.
        expect(response.headers.get('location')).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  it('unauthenticated user on the landing page ("/") stays on the landing page', async () => {
    const req = createRequest('/');
    const response = await middleware(req);

    expect(response.headers.get('location')).toBeNull();
  });
});
