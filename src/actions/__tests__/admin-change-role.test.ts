// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const update = vi.fn();
vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    update: () => ({ set: (patch: unknown) => ({ where: () => update(patch) }) }),
  },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email/service', () => ({ sendEmail: vi.fn(), sendClassCancellationEmail: vi.fn() }));

import { changeUserRoleAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import type { UserRole } from '@/lib/types/roles';

const as = (role: UserRole) => ({ sub: `${role}-1`, role, email: `${role}@test.com`, iat: 0, exp: 0 });

/** El admin puede asignar el rol `barra` (TASK-CF-ROLE-01). */
describe('changeUserRoleAction — rol barra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: 'u1' } as never);
  });

  it('el admin asigna barra', async () => {
    vi.mocked(getSession).mockResolvedValue(as('admin'));
    expect(await changeUserRoleAction('u1', 'barra')).toMatchObject({ success: true });
    expect(update).toHaveBeenCalledWith({ role: 'barra' });
  });

  it.each(['barra', 'coach', 'client'] as const)('un %s no puede cambiar roles y no toca la BD', async (role) => {
    vi.mocked(getSession).mockResolvedValue(as(role));
    expect(await changeUserRoleAction('u1', 'barra')).toMatchObject({ success: false });
    expect(db.query.users.findFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('un rol desconocido se rechaza', async () => {
    vi.mocked(getSession).mockResolvedValue(as('admin'));
    expect(await changeUserRoleAction('u1', 'cajero')).toEqual({ success: false, error: 'Rol no válido.' });
  });
});
