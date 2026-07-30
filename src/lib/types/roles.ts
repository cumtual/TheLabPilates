export type UserRole = 'client' | 'coach' | 'admin';

export const ROLES = {
  CLIENT: 'client' as const,
  COACH: 'coach' as const,
  ADMIN: 'admin' as const,
};

export const ALL_ROLES: UserRole[] = ['client', 'coach', 'admin'];
