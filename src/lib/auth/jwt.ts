import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@/lib/types';

export interface JWTPayload {
  sub: string;
  role: UserRole;
  email: string;
  iat: number;
  exp: number;
}

const getSecret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>
): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getSecret());
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
