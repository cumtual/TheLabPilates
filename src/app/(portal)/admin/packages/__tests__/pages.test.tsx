import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Las páginas del catálogo son solo para admin (SPEC-SPECIAL-PACKAGES §7.2). */

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/lib/queries/packages', () => ({ getAdminPackages: vi.fn(), getAdminPackage: vi.fn() }));
vi.mock('@/components/admin/packages/PackageList', () => ({ PackageList: () => null }));
vi.mock('@/components/admin/packages/PackageForm', () => ({ PackageForm: () => null }));

import AdminPackagesPage from '../page';
import AdminNewPackagePage from '../new/page';
import AdminEditPackagePage from '../[id]/edit/page';
import { getSession } from '@/lib/auth/session';
import { getAdminPackage, getAdminPackages } from '@/lib/queries/packages';

const params = Promise.resolve({ id: 'p1' });

beforeEach(() => vi.clearAllMocks());

describe('páginas de /admin/packages', () => {
  it.each(['coach', 'client', null])('redirigen a /login a %s sin consultar el catálogo', async (role) => {
    vi.mocked(getSession).mockResolvedValue((role ? { sub: 'x', role, email: 'x@test.com' } : null) as never);
    await expect(AdminPackagesPage()).rejects.toThrow('REDIRECT:/login');
    await expect(AdminNewPackagePage()).rejects.toThrow('REDIRECT:/login');
    await expect(AdminEditPackagePage({ params })).rejects.toThrow('REDIRECT:/login');
    expect(getAdminPackages).not.toHaveBeenCalled();
    expect(getAdminPackage).not.toHaveBeenCalled();
  });

  it('editar un paquete inexistente o eliminado responde 404', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'a', role: 'admin', email: 'a@test.com' } as never);
    vi.mocked(getAdminPackage).mockResolvedValue(null);
    await expect(AdminEditPackagePage({ params })).rejects.toThrow('NOT_FOUND');
  });

  it('el admin ve el listado', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'a', role: 'admin', email: 'a@test.com' } as never);
    vi.mocked(getAdminPackages).mockResolvedValue([]);
    expect(await AdminPackagesPage()).toBeTruthy();
    expect(getAdminPackages).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });
});
