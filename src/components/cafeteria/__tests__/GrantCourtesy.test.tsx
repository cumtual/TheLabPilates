import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { sampleCategories, sampleProducts } from '@/modules/cafeteria/domain/__tests__/fixtures';
import type { CustomerResult, GrantListItem } from '@/modules/cafeteria/presentation/types';
import { expectConfirmBeforeAction } from '@/test-utils/confirm';

vi.mock('@/modules/cafeteria/presentation/actions/admin', () => ({
  grantCourtesyAction: vi.fn(),
  searchUsersForGrantAction: vi.fn(),
  revokeCourtesyAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { grantCourtesyAction, revokeCourtesyAction, searchUsersForGrantAction } from '@/modules/cafeteria/presentation/actions/admin';
import { CourtesyGrantList } from '../CourtesyGrantList';
import { GrantCourtesyForm } from '../GrantCourtesyForm';

/** Regalar y revocar cortesías (SPEC-CAFETERIA D11, TASK-CF-ADM-07). */

const ana: CustomerResult = { id: 'u-ana', name: 'Ana Cliente', email: 'ana@correo.com', role: 'client', discount: null, courtesy: { monthly: null, grants: [] } };
const menu = { categories: sampleCategories, products: sampleProducts };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchUsersForGrantAction).mockResolvedValue({ success: true, data: [ana] });
  vi.mocked(grantCourtesyAction).mockResolvedValue({ success: true, data: { id: 'g1' } });
  vi.mocked(revokeCourtesyAction).mockResolvedValue({ success: true, data: undefined });
});

describe('GrantCourtesyForm', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  async function pickAna() {
    fireEvent.change(screen.getByLabelText('Buscar usuario por nombre o correo'), { target: { value: 'an' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    const option = await screen.findByRole('option');
    expect(option).toHaveTextContent('Ana Cliente');
    expect(option).toHaveTextContent('ana@correo.com');
    fireEvent.click(option);
  }

  it('no se puede enviar sin elegir usuario; sin alcance válido hay error en el campo', () => {
    render(<GrantCourtesyForm menu={menu} today="2026-10-15" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Una categoría o subcategoría' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regalar' }));
    expect(screen.getByText('Elige a quién regalar.')).toBeInTheDocument();
    expect(screen.getByText('Elige la categoría.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el árbol de categorías incluye padres y subcategorías; el producto va agrupado', () => {
    render(<GrantCourtesyForm menu={menu} today="2026-10-15" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Una categoría o subcategoría' }));
    const options = within(screen.getByLabelText('Categoría del regalo')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(['Bebidas', 'Comida', 'Comida › Postres', 'Comida › Sandwiches']));
    fireEvent.click(screen.getByRole('radio', { name: 'Un producto' }));
    expect(within(screen.getByLabelText('Producto del regalo')).getByRole('option', { name: 'Latte (caliente)' })).toBeInTheDocument();
  });

  it('cantidad 1–50 y vencimiento no pasado', async () => {
    render(<GrantCourtesyForm menu={menu} today="2026-10-15" />);
    await pickAna();
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '51' } });
    fireEvent.change(screen.getByLabelText('Vence (opcional)'), { target: { value: '2026-10-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regalar' }));
    expect(screen.getByText('La cantidad va de 1 a 50.')).toBeInTheDocument();
    expect(screen.getByText('El vencimiento no puede ser una fecha pasada.')).toBeInTheDocument();
  });

  it('confirma con usuario, cantidad, alcance legible y vencimiento antes de llamar', async () => {
    render(<GrantCourtesyForm menu={menu} today="2026-10-15" />);
    await pickAna();
    fireEvent.click(screen.getByRole('radio', { name: 'Una categoría o subcategoría' }));
    fireEvent.change(screen.getByLabelText('Categoría del regalo'), { target: { value: 'postres' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Vence (opcional)'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regalar' }));
    const dialog = screen.getByRole('dialog');
    for (const text of ['Ana Cliente', 'Cantidad: 2', 'Comida › Postres', '20/10/2026']) expect(dialog).toHaveTextContent(text);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Regalar' })),
      action: vi.mocked(grantCourtesyAction),
      confirmLabel: 'Sí, regalar',
    });
    expect(grantCourtesyAction).toHaveBeenCalledWith({ userId: 'u-ana', quantity: 2, scope: { type: 'category', categoryId: 'postres' }, expiresOn: '2026-10-20', note: null });
  });
});

const grant = (overrides: Partial<GrantListItem>): GrantListItem => ({
  id: 'g1', userId: 'u-ana', userName: 'Ana Cliente', userEmail: 'ana@correo.com', scopeLabel: 'Comida › Postres', quantity: 2, redeemed: 1, remaining: 1,
  status: 'active', expiresAt: new Date('2026-10-20T23:59:59.999-06:00'), note: null, grantedByName: 'Admin', createdAt: new Date('2026-10-15T16:00:00Z'),
  revokedAt: null, revokeReason: null, ...overrides,
});

describe('CourtesyGrantList', () => {
  const grants = [
    grant({}),
    grant({ id: 'g2', userName: 'Carla', userEmail: 'carla@lab.mx', status: 'used', redeemed: 2, remaining: 0, scopeLabel: 'Cualquier artículo' }),
    grant({ id: 'g3', status: 'unavailable', scopeLabel: 'Pay' }),
  ];

  it('estado, usadas/total, vencimiento y quién regaló (CDMX); filtros', () => {
    render(<CourtesyGrantList grants={grants} />);
    const first = within(screen.getByTestId('grant-g1'));
    expect(first.getByText('Activo')).toBeInTheDocument();
    expect(first.getByText(/usadas 1 de 2 · vence 20\/10\/2026/)).toBeInTheDocument();
    expect(first.getByText(/Regaló Admin el 15\/10\/2026, 10:00 AM/)).toBeInTheDocument();
    expect(within(screen.getByTestId('grant-g3')).getByText('Alcance no disponible')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'used' } });
    expect(screen.queryByTestId('grant-g1')).toBeNull();
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar por usuario'), { target: { value: 'carla@' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('revocar solo en activos; muestra cuántas quedan y exige el motivo antes de confirmar', async () => {
    render(<CourtesyGrantList grants={grants} />);
    expect(within(screen.getByTestId('grant-g2')).queryByRole('button', { name: 'Revocar' })).toBeNull();
    expect(within(screen.getByTestId('grant-g3')).queryByRole('button', { name: 'Revocar' })).toBeNull();
    fireEvent.click(within(screen.getByTestId('grant-g1')).getByRole('button', { name: 'Revocar' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('le quedan 1');
    expect(within(dialog).getByRole('button', { name: 'Sí, revocar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo (obligatorio)'), { target: { value: 'Error' } });
    expect(revokeCourtesyAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, revocar' }));
    await waitFor(() => expect(revokeCourtesyAction).toHaveBeenCalledWith({ grantId: 'g1', reason: 'Error' }));
  });
});
