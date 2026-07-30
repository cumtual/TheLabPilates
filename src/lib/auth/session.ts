import { cookies } from 'next/headers';
import { signJWT, verifyJWT, type JWTPayload } from './jwt';
import type { UserRole } from '@/lib/types';

const SESSION_COOKIE = 'session';

export async function createSession(
  userId: string,
  role: UserRole,
  email: string
): Promise<void> {
  const token = await signJWT({ sub: userId, role, email });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour (matches JWT expiry)
  });
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyJWT(token);
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
