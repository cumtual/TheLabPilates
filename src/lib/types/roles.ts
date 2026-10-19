// 'barra' = cajero y barista de la cafetería (SPEC-CAFETERIA D1).
export type UserRole = 'client' | 'coach' | 'admin' | 'barra';

export const ROLES = {
  CLIENT: 'client' as const,
  COACH: 'coach' as const,
  ADMIN: 'admin' as const,
  BARRA: 'barra' as const,
};

export const ALL_ROLES: UserRole[] = ['client', 'coach', 'admin', 'barra'];

export const ROLE_LABELS: Record<UserRole, string> = {
  client: 'Cliente',
  coach: 'Coach',
  admin: 'Admin',
  barra: 'Barra',
};

/** Portal de cada rol. El middleware solo deja entrar a ese prefijo. */
export function dashboardForRole(role: UserRole): string {
  return `/${role}`;
}
