import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** La landing lee el catálogo (SPEC-SPECIAL-PACKAGES §9, D7). */

vi.mock('@/lib/queries/packages', () => ({ getPublicPackages: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

import Pricing from '../Pricing';
import { getPublicPackages } from '@/lib/queries/packages';
import { toPackageCardView, type PackageCardSource } from '@/lib/subscription/package-view';

const source = (overrides: Partial<PackageCardSource>): PackageCardSource => ({
  id: 'p', name: 'Lab Entry', kind: 'standard', guest: false, sessions: 4, price: 360, validityDays: null, guestCredits: 0,
  shortDescription: 'Empieza a descubrir de lo que eres capaz.', features: ['Flexibilidad de horario'], isFeatured: false, ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('Pricing', () => {
  it('renderiza los paquetes en el orden recibido, con la cuadrícula según la cantidad', async () => {
    vi.mocked(getPublicPackages).mockResolvedValue([
      toPackageCardView(source({ id: 'a', name: 'Lab Entry' })),
      toPackageCardView(source({ id: 'b', name: 'Open Lab', guest: true, isFeatured: true, price: 1850 })),
    ]);

    const { container } = render(await Pricing());

    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Lab Entry', '∞ Open Lab']);
    expect(container.querySelector('#paquetes .grid')?.className).toBe('grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto');
    expect(screen.getByText('1,850')).toBeInTheDocument();
  });

  it('un especial muestra su desglose y sus pases de invitado', async () => {
    vi.mocked(getPublicPackages).mockResolvedValue([
      toPackageCardView(source({
        id: 'r', name: 'Reset Pass', kind: 'special', guestCredits: 2, price: 179,
        rules: [
          { label: null, credits: 1, allowedClassTypes: ['yoga'], windowStart: null, windowEnd: null },
          { label: null, credits: 1, allowedClassTypes: ['mat_pilates', 'barre'], windowStart: null, windowEnd: null },
        ],
      })),
    ]);

    const card = within((render(await Pricing())).container.querySelector('#paquetes .grid') as HTMLElement);
    expect(card.getByText('1 YOGA · 1 MAT PILATES / BARRE')).toBeInTheDocument();
    expect(card.getByText('+2 Invitados')).toBeInTheDocument();
  });

  it('sin paquetes conserva el encabezado y el ancla #paquetes', async () => {
    vi.mocked(getPublicPackages).mockResolvedValue([]);

    const { container } = render(await Pricing());

    expect(container.querySelector('section#paquetes')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Membresías' })).toBeInTheDocument();
    expect(screen.getByText('Pronto anunciaremos nuestros paquetes.')).toBeInTheDocument();
  });

  it('el filtro de activos vive en la consulta y el componente no consulta otra cosa', async () => {
    vi.mocked(getPublicPackages).mockResolvedValue([]);
    await Pricing();
    expect(getPublicPackages).toHaveBeenCalledTimes(1);
    const component = readFileSync(join(process.cwd(), 'src/components/sections/Pricing.tsx'), 'utf8');
    expect(component).not.toMatch(/const packages = \[/); // ya no hay paquetes escritos a mano
    expect(component).not.toMatch(/from '@\/db'/);
  });
});
