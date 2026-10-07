import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { AdminPackageView } from '@/lib/queries/packages';

/** Formulario de paquete (SPEC-SPECIAL-PACKAGES §7.3): límites de 49 caracteres y 4 beneficios. */

const push = vi.fn();
vi.mock('@/actions/admin-packages', () => ({ createPackageAction: vi.fn(), updatePackageAction: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { PackageForm } from '../PackageForm';
import { createPackageAction, updatePackageAction } from '@/actions/admin-packages';

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillStandard() {
  type(/^Nombre/, 'Lab Entry');
  type(/Descripción corta/, 'Empieza a descubrir de lo que eres capaz.');
  type(/^Precio \(MXN\)/, '360');
  type(/^Sesiones/, '4');
}

const existing: AdminPackageView = {
  id: 'p1', name: 'Reset Pass', displayName: 'Reset Pass', shortDescription: 'Un respiro.', sessionsLabel: '1 YOGA', priceLabel: '179', price: 179,
  features: ['Sin compromiso'], isFeatured: false, isUnlimited: false, guestBadge: null, validityLabel: 'Vigencia: 2 semanas', ctaLabel: 'ELEGIR', breakdown: [],
  kind: 'special', isActive: true, validityDays: 14, guestCredits: 1, sessions: 1, displayOrder: 6, salesCount: 2,
  rules: [{ label: null, credits: 1, allowedClassTypes: ['yoga'], timeWindow: { start: '07:00', end: '11:00' } }],
};

beforeEach(() => vi.clearAllMocks());

describe('PackageForm — límites de la tarjeta', () => {
  it('descripción: maxLength 49, contador y recorte al pegar de más con el mensaje de Zod', () => {
    render(<PackageForm />);
    const description = screen.getByLabelText(/Descripción corta/) as HTMLInputElement;
    expect(description).toHaveAttribute('maxLength', '49');

    type(/Descripción corta/, 'x'.repeat(49));
    expect(screen.getByText('49/49')).toHaveClass('text-error');

    type(/Descripción corta/, 'y'.repeat(60));
    expect(description.value).toBe('y'.repeat(49));
    expect(screen.getByText('La descripción debe tener menos de 50 caracteres.')).toBeInTheDocument();
  });

  it('beneficios: «Agregar beneficio» se deshabilita con 4 y se habilita al quitar uno', () => {
    render(<PackageForm />);
    const add = screen.getByRole('button', { name: /Agregar beneficio/ });
    for (let i = 0; i < 4; i++) fireEvent.click(add);

    expect(screen.getAllByLabelText(/^Beneficio \d$/)).toHaveLength(4);
    expect(add).toBeDisabled();
    expect(screen.getByText('Máximo 4 beneficios')).toBeInTheDocument();
    expect(screen.getByLabelText('Beneficio 1')).toHaveAttribute('maxLength', '24');

    fireEvent.click(screen.getAllByRole('button', { name: /Quitar beneficio/ })[0]);
    expect(add).not.toBeDisabled();
  });

  it('vigencia en semanas muestra el total en días', () => {
    render(<PackageForm />);
    type('Vigencia', '2');
    fireEvent.change(screen.getByLabelText('Unidad de vigencia'), { target: { value: 'weeks' } });
    expect(screen.getByText('= 14 días')).toBeInTheDocument();
  });
});

describe('PackageForm — envío', () => {
  it('crea un estándar con un PackageInput tipado y vuelve al listado', async () => {
    vi.mocked(createPackageAction).mockResolvedValue({ success: true, message: 'Paquete creado.', data: { id: 'new' } });
    render(<PackageForm />);
    fillStandard();
    fireEvent.click(screen.getByRole('button', { name: /Agregar beneficio/ }));
    type('Beneficio 1', 'Flexibilidad de horario');

    fireEvent.click(screen.getByRole('button', { name: 'Crear paquete' }));

    await waitFor(() => expect(createPackageAction).toHaveBeenCalledTimes(1));
    expect(createPackageAction).toHaveBeenCalledWith({
      kind: 'standard',
      name: 'Lab Entry',
      shortDescription: 'Empieza a descubrir de lo que eres capaz.',
      features: ['Flexibilidad de horario'],
      price: 360,
      validity: { amount: 30, unit: 'days' },
      displayOrder: 0,
      isFeatured: false,
      sessions: 4,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/packages'));
  });

  it('no envía si hay errores y los muestra bajo cada campo', async () => {
    render(<PackageForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear paquete' }));
    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('La descripción es obligatoria.')).toBeInTheDocument();
    expect(createPackageAction).not.toHaveBeenCalled();
  });

  it('muestra bajo su campo los fieldErrors del servidor', async () => {
    vi.mocked(createPackageAction).mockResolvedValue({ success: false, error: 'Revisa los campos marcados.', field: 'name', fieldErrors: { name: 'Ya existe un paquete con ese nombre.' } });
    render(<PackageForm />);
    fillStandard();
    fireEvent.click(screen.getByRole('button', { name: 'Crear paquete' }));
    expect(await screen.findByText('Ya existe un paquete con ese nombre.')).toBeInTheDocument();
  });
});

describe('PackageForm — edición de un especial', () => {
  it('el tipo no se puede cambiar, avisa de las ventas y envía las reglas', async () => {
    vi.mocked(updatePackageAction).mockResolvedValue({ success: true, message: 'Paquete actualizado.', data: { id: 'p1' } });
    render(<PackageForm pkg={existing} />);

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText('Especial')).toBeInTheDocument();
    expect(screen.getByText('Este paquete ya tiene 2 ventas. Los cambios aplican solo a compras nuevas.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(updatePackageAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updatePackageAction).mock.calls[0]).toEqual([
      'p1',
      expect.objectContaining({
        kind: 'special',
        validity: { amount: 2, unit: 'weeks' },
        guestCredits: 1,
        rules: [{ credits: 1, allowedClassTypes: ['yoga'], timeWindow: { start: '07:00', end: '11:00' }, label: null }],
      }),
    ]);
  });

  it('la vista previa usa la misma tarjeta de la landing y cambia en vivo', () => {
    render(<PackageForm pkg={existing} />);
    const preview = within(screen.getByTestId('package-preview'));
    expect(preview.getByText('1 YOGA')).toBeInTheDocument();
    type(/^Nombre/, 'Reset Pass Plus');
    expect(preview.getByText('Reset Pass Plus')).toBeInTheDocument();
  });
});
