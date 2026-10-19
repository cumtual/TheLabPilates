import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/modules/cafeteria/presentation/public-menu', () => ({ getCachedMenu: vi.fn().mockResolvedValue([]) }));
vi.mock('@/components/layout/Navbar', () => ({ default: () => null }));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));

import { getCachedMenu } from '@/modules/cafeteria/presentation/public-menu';
import MenuPage, { dynamic } from '../page';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

/** /menu (SPEC-CAFETERIA §7, TASK-CF-MENU-01). */
describe('/menu', () => {
  it('es dinámica y lee el menú del caché', async () => {
    expect(dynamic).toBe('force-dynamic');
    render(await MenuPage());
    expect(getCachedMenu).toHaveBeenCalled();
    expect(screen.getByText('Muy pronto publicaremos nuestro menú.')).toBeInTheDocument();
  });

  it('no requiere sesión', async () => {
    const response = await middleware(new NextRequest(new URL('http://localhost/menu')));
    expect(response.headers.get('location')).toBeNull();
  });
});
