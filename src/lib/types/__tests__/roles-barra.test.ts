import { describe, it, expect } from 'vitest';
import { ALL_ROLES, ROLES, ROLE_LABELS, dashboardForRole } from '@/lib/types/roles';

/** Rol `barra` (SPEC-CAFETERIA D1, TASK-CF-ROLE-01). */
describe('roles', () => {
  it('ALL_ROLES incluye barra', () => {
    expect(ALL_ROLES).toEqual(['client', 'coach', 'admin', 'barra']);
    expect(ROLES.BARRA).toBe('barra');
  });

  it('cada rol tiene su portal', () => {
    expect(ALL_ROLES.map(dashboardForRole)).toEqual(['/client', '/coach', '/admin', '/barra']);
  });

  it('cada rol tiene etiqueta en español', () => {
    expect(ROLE_LABELS).toEqual({ client: 'Cliente', coach: 'Coach', admin: 'Admin', barra: 'Barra' });
  });
});
