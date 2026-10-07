import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { AdminPackageView } from '@/lib/queries/packages';

/** Listado del catálogo (SPEC-SPECIAL-PACKAGES §7.2). */

vi.mock('@/actions/admin-packages', () => ({ setPackageActiveAction: vi.fn(), softDeletePackageAction: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PackageList } from '../PackageList';
import { setPackageActiveAction, softDeletePackageAction } from '@/actions/admin-packages';

function pkg(overrides: Partial<AdminPackageView> = {}): AdminPackageView {
  return {
    id: 'p1', name: 'Reset Pass', displayName: 'Reset Pass', shortDescription: 'Un respiro.', sessionsLabel: '1 YOGA', priceLabel: '179', price: 179,
    features: [], isFeatured: false, isUnlimited: false, guestBadge: null, validityLabel: 'Vigencia: 2 semanas', ctaLabel: 'ELEGIR', breakdown: [],
    kind: 'special', isActive: true, validityDays: 14, guestCredits: 0, sessions: 2, displayOrder: 6, salesCount: 3, rules: [], ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('PackageList', () => {
  it('muestra orden, nombre, tipo, precio, vigencia, ventas y estado', () => {
    render(<PackageList packages={[pkg(), pkg({ id: 'p2', name: 'Lab Entry', displayName: 'Lab Entry', kind: 'standard', isActive: false, salesCount: 0, priceLabel: '360', validityLabel: 'Vigencia: 30 días' })]} />);

    const first = within(screen.getByTestId('package-p1'));
    expect(first.getByText('Reset Pass')).toBeInTheDocument();
    expect(first.getByText('Especial')).toBeInTheDocument();
    expect(first.getByText('$179')).toBeInTheDocument();
    expect(first.getByText('Vigencia: 2 semanas')).toBeInTheDocument();
    expect(first.getByText('3 ventas')).toBeInTheDocument();
    expect(first.getByText('Activo')).toBeInTheDocument();
    expect(first.getByText('#6')).toBeInTheDocument();
    expect(first.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/admin/packages/p1/edit');

    const second = within(screen.getByTestId('package-p2'));
    expect(second.getByText('Estándar')).toBeInTheDocument();
    expect(second.getByText('Inactivo')).toBeInTheDocument();
    expect(second.getByText('0 ventas')).toBeInTheDocument();
    expect(second.getByRole('button', { name: 'Activar' })).toBeInTheDocument();
  });

  it('desactivar llama a la acción y muestra su mensaje', async () => {
    vi.mocked(setPackageActiveAction).mockResolvedValue({ success: true, message: 'Paquete desactivado.', data: { id: 'p1', isActive: false } });
    render(<PackageList packages={[pkg()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Paquete desactivado.'));
    expect(setPackageActiveAction).toHaveBeenCalledWith('p1', false);
  });

  it('eliminar pide confirmación y solo entonces llama a la acción', async () => {
    vi.mocked(softDeletePackageAction).mockResolvedValue({ success: true, message: 'Paquete eliminado.', data: { id: 'p1' } });
    render(<PackageList packages={[pkg()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('El paquete dejará de mostrarse en la landing y en la tienda. Las suscripciones ya vendidas no cambian.');
    expect(softDeletePackageAction).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, eliminar' }));
    await waitFor(() => expect(softDeletePackageAction).toHaveBeenCalledWith('p1'));
  });

  it('sin paquetes muestra el estado vacío y el botón para crear', () => {
    render(<PackageList packages={[]} />);
    expect(screen.getByText('Aún no hay paquetes.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nuevo paquete/ })).toHaveAttribute('href', '/admin/packages/new');
  });
});
