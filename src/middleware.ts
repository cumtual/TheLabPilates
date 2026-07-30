import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'session';

const protectedPrefixes = ['/client', '/coach', '/admin'];
const authPages = ['/login', '/register', '/reset-password'];

const roleDashboard: Record<string, string> = {
  client: '/client',
  coach: '/coach',
  admin: '/admin',
};

async function verifyToken(token: string) {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as { sub: string; role: string; email: string };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  // Check if user is on auth pages or root
  const isAuthPage =
    authPages.some((p) => pathname.startsWith(p)) || pathname === '/';
  const isProtectedRoute = protectedPrefixes.some((p) =>
    pathname.startsWith(p)
  );

  // If not a protected route and not an auth page, pass through
  if (!isProtectedRoute && !isAuthPage) {
    return NextResponse.next();
  }

  const payload = token ? await verifyToken(token) : null;

  // Authenticated user on auth pages or root → redirect to their portal
  if (isAuthPage && payload) {
    const dashboard = roleDashboard[payload.role] || '/client';
    return NextResponse.redirect(new URL(dashboard, request.url));
  }

  // Unauthenticated user on protected route → redirect to login
  if (isProtectedRoute && !payload) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Authenticated user on wrong portal → redirect to correct one
  if (isProtectedRoute && payload) {
    const allowedPrefix = roleDashboard[payload.role] || '/client';
    if (!pathname.startsWith(allowedPrefix)) {
      return NextResponse.redirect(new URL(allowedPrefix, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/register',
    '/reset-password/:path*',
    '/client/:path*',
    '/coach/:path*',
    '/admin/:path*',
  ],
};
