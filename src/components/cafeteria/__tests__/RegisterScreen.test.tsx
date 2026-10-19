import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { buildMenuTree } from '@/modules/cafeteria/domain/category-tree';
import { sampleCategories, sampleProducts } from '@/modules/cafeteria/domain/__tests__/fixtures';
import type { CustomerResult, RegisterData } from '@/modules/cafeteria/presentation/types';
import { expectConfirmBeforeAction } from '@/test-utils/confirm';

vi.mock('@/modules/cafeteria/presentation/actions/register', () => ({ createOrderAction: vi.fn(), searchCustomersAction: vi.fn() }));

import { createOrderAction, searchCustomersAction } from '@/modules/cafeteria/presentation/actions/register';
import { RegisterScreen } from '../RegisterScreen';

/** Caja de la barra (SPEC-CAFETERIA §8.1, §8.4, TASK-CF-BAR-01..03). */

const data = (overrides: Partial<RegisterData> = {}): RegisterData => ({
  sections: buildMenuTree(sampleCategories, sampleProducts.map((p) => (p.id === 'panini' ? { ...p, isAvailable: false } : p))),
  monthlyEligibleIds: ['latte-hot', 'latte-cold', 'americano', 'frappe-moka', 'agua'],
  barAccount: { id: 'card', bank: 'BBVA', holder: 'The Lab Pilates', number: '012345678901234567' },
  ...overrides,
});

const coach: CustomerResult = {
  id: 'coach-1', name: 'Carla Coach', email: 'carla@lab.mx', role: 'coach', discount: null,
  courtesy: { monthly: { used: 3, limit: 4, remaining: 1 }, grants: [{ id: 'g1', scopeLabel: 'Comida › Postres', scope: { type: 'category', categoryId: 'postres' }, remaining: 2, quantity: 2, expiresAt: new Date('2026-10-20T23:59:59.999-06:00') }] },
};
const client: CustomerResult = { id: 'client-1', name: 'Ana', email: 'ana@correo.com', role: 'client', discount: null, courtesy: { monthly: null, grants: [] } };

const add = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const total = () => screen.getByTestId('cart-total').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createOrderAction).mockResolvedValue({ success: true, data: { orderId: 'o1', folio: 17, totalCents: 13500, discountCents: 0, courtesyApplied: 0, duplicate: false } });
});

describe('menú de la caja', () => {
  it('pestañas de categoría padre, chips de subcategoría y filtro de temperatura solo en bebidas', () => {
    render(<RegisterScreen data={data()} />);
    const tabs = within(screen.getByRole('tablist', { name: 'Categorías' }));
    expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Bebidas', 'Comida']);
    expect(screen.getByLabelText('Temperatura')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Frías' }));
    expect(screen.queryByRole('button', { name: 'Agregar Latte caliente' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar Latte fría' })).toBeInTheDocument();

    fireEvent.click(tabs.getByRole('tab', { name: 'Comida' }));
    expect(screen.queryByLabelText('Temperatura')).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Subcategorías')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todas', 'Postres', 'Sandwiches']);
    fireEvent.click(screen.getByRole('button', { name: 'Postres' }));
    expect(screen.getByRole('button', { name: 'Agregar Brownie' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar Panini' })).not.toBeInTheDocument();
  });

  it('ícono de frío/caliente en bebidas y no en comida; precio con centavos; agotado deshabilitado', () => {
    render(<RegisterScreen data={data()} />);
    const americano = screen.getByRole('button', { name: 'Agregar Americano caliente' });
    expect(within(americano).getByRole('img', { name: 'Caliente' })).toBeInTheDocument();
    expect(americano).toHaveTextContent('$42.50');
    fireEvent.click(screen.getByRole('tab', { name: 'Comida' }));
    expect(within(screen.getByRole('button', { name: 'Agregar Brownie' })).queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Agregar Panini' })).toBeDisabled();
  });

  it('el buscador filtra en todo el menú', () => {
    render(<RegisterScreen data={data()} />);
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'brow' } });
    expect(screen.getByRole('button', { name: 'Agregar Brownie' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar Latte/ })).not.toBeInTheDocument();
  });
});

describe('carrito', () => {
  it('suma cantidades y total exactos; en móvil es un panel inferior', () => {
    render(<RegisterScreen data={data()} />);
    add(/Agregar Latte caliente/);
    add(/Agregar Latte caliente/);
    add(/Agregar Americano/);
    expect(total()).toBe('$172.50');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar uno de Latte' }));
    expect(total()).toBe('$107.50');
    expect(screen.getByTestId('cart').className).toMatch(/fixed bottom-0 .*md:static/);
  });
});

describe('cliente y cortesías', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  async function pick(user: CustomerResult) {
    vi.mocked(searchCustomersAction).mockResolvedValue({ success: true, data: [user] });
    fireEvent.click(screen.getByRole('tab', { name: 'Cliente registrado' }));
    fireEvent.change(screen.getByLabelText('Buscar cliente por nombre o correo'), { target: { value: user.name.slice(0, 3) } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.click(await screen.findByRole('option', { name: new RegExp(user.email) }));
  }

  it('espera 300 ms, no busca con menos de 2 letras y muestra nombre y correo', async () => {
    // Reloj totalmente manual: el tiempo real no avanza el debounce.
    vi.useRealTimers();
    vi.useFakeTimers();
    render(<RegisterScreen data={data()} />);
    vi.mocked(searchCustomersAction).mockResolvedValue({ success: true, data: [coach] });
    fireEvent.click(screen.getByRole('tab', { name: 'Cliente registrado' }));
    fireEvent.change(screen.getByLabelText('Buscar cliente por nombre o correo'), { target: { value: 'c' } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(searchCustomersAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Buscar cliente por nombre o correo'), { target: { value: 'car' } });
    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(searchCustomersAction).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(searchCustomersAction).toHaveBeenCalledWith('car');
    const option = screen.getByRole('option');
    expect(option).toHaveTextContent('Carla Coach');
    expect(option).toHaveTextContent('carla@lab.mx');
  });

  it('coach: panel con cupo y regalos; marca por defecto hasta agotar y dice qué crédito usa', async () => {
    render(<RegisterScreen data={data()} />);
    await pick(coach);
    const panel = screen.getByTestId('courtesy-panel');
    expect(panel).toHaveTextContent('Cupo de coach: 1 de 4 este mes');
    expect(panel).toHaveTextContent('Comida › Postres · quedan 2 · vence 20/10/2026');

    add(/Agregar Latte caliente/);
    add(/Agregar Latte caliente/);
    expect(screen.getByLabelText('Cortesías de Latte')).toHaveTextContent('1/2');
    expect(screen.getByText('Usa: Cupo mensual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Una cortesía más en Latte' })).toBeDisabled();
    expect(total()).toBe('$65.00');

    fireEvent.click(screen.getByRole('tab', { name: 'Comida' }));
    add(/Agregar Brownie/);
    expect(screen.getByText('Usa: Comida › Postres')).toBeInTheDocument();
  });

  it('un usuario sin cortesías no ve el panel; cambiar de cliente limpia las marcadas', async () => {
    render(<RegisterScreen data={data()} />);
    await pick(coach);
    add(/Agregar Latte caliente/);
    expect(screen.getByLabelText('Cortesías de Latte')).toHaveTextContent('1/1');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(screen.queryByLabelText('Cortesías de Latte')).not.toBeInTheDocument();
    expect(total()).toBe('$65.00');
    await pick(client);
    expect(screen.queryByTestId('courtesy-panel')).not.toBeInTheDocument();
  });

  it('100 % cortesía: no pide método pero sí confirmación', async () => {
    render(<RegisterScreen data={data()} />);
    await pick(coach);
    add(/Agregar Latte caliente/);
    expect(screen.queryByRole('button', { name: 'Efectivo' })).not.toBeInTheDocument();
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Registrar cortesía' })),
      action: vi.mocked(createOrderAction),
      confirmLabel: 'Sí, registrar',
    });
    expect(vi.mocked(createOrderAction).mock.calls[0][0]).toMatchObject({
      customer: { type: 'user', userId: 'coach-1' },
      items: [{ productId: 'latte-hot', quantity: 1, courtesy: true }],
      paymentMethod: null,
    });
  });
});

describe('cobro (D9)', () => {
  it('efectivo: confirma con total y artículos; no llama hasta confirmar', async () => {
    render(<RegisterScreen data={data()} />);
    add(/Agregar Latte caliente/);
    add(/Agregar Agua/);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Cobrar $85.00 en efectivo — 2 artículos');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Efectivo' })),
      action: vi.mocked(createOrderAction),
      confirmLabel: 'Sí, cobrar',
    });
    expect(vi.mocked(createOrderAction).mock.calls[0][0]).toMatchObject({ paymentMethod: 'cash', customer: { type: 'none' } });
    expect(await screen.findByRole('status')).toHaveTextContent('Pedido #17 registrado');
    expect(total()).toBe('$0.00');
  });

  it('transferencia: muestra la cuenta de barra y el total', async () => {
    render(<RegisterScreen data={data()} />);
    add(/Agregar Latte caliente/);
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Transferencia' })),
      action: vi.mocked(createOrderAction),
      confirmLabel: 'Transferencia recibida, cobrar',
    });
    expect(vi.mocked(createOrderAction).mock.calls[0][0]).toMatchObject({ paymentMethod: 'transfer' });
  });

  it('transferencia: datos visibles en el modal; sin cuenta marcada se deshabilita con aviso', () => {
    const { unmount } = render(<RegisterScreen data={data()} />);
    add(/Agregar Latte caliente/);
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }));
    const dialog = screen.getByRole('dialog');
    for (const text of ['BBVA', 'The Lab Pilates', '012345678901234567', '$65.00']) expect(dialog).toHaveTextContent(text);
    unmount();
    render(<RegisterScreen data={data({ barAccount: null })} />);
    add(/Agregar Latte caliente/);
    expect(screen.getByRole('button', { name: 'Transferencia' })).toBeDisabled();
    expect(screen.getByText(/Transferencia no disponible/)).toBeInTheDocument();
  });

  it('cada envío usa un requestId nuevo; un error conserva el carrito', async () => {
    vi.mocked(createOrderAction).mockResolvedValueOnce({ success: false, error: 'Latte no está disponible.' });
    render(<RegisterScreen data={data()} />);
    add(/Agregar Latte caliente/);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cobrar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Latte no está disponible.');
    expect(total()).toBe('$65.00');
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cobrar' }));
    await waitFor(() => expect(createOrderAction).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(createOrderAction).mock.calls.map((c) => (c[0] as { requestId: string }).requestId);
    expect(first).not.toBe(second);
  });
});

describe('descuento por membresía (D13)', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('cliente con Lab Progress: se ve el descuento, el total baja y la confirmación lo muestra', async () => {
    const member: CustomerResult = { ...client, discount: { percent: 10, label: 'Lab Progress 10%' } };
    vi.mocked(searchCustomersAction).mockResolvedValue({ success: true, data: [member] });
    render(<RegisterScreen data={data()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cliente registrado' }));
    fireEvent.change(screen.getByLabelText('Buscar cliente por nombre o correo'), { target: { value: 'Ana' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.click(await screen.findByRole('option', { name: /ana@correo.com/ }));
    expect(screen.getByTestId('member-discount')).toHaveTextContent('Descuento Lab Progress 10% en la barra');

    add(/Agregar Latte caliente/);
    add(/Agregar Americano/);
    const discount = within(screen.getByLabelText('Descuento'));
    expect(discount.getByText('Subtotal').nextSibling).toHaveTextContent('$107.50');
    expect(discount.getByText('Descuento Lab Progress 10%').nextSibling).toHaveTextContent('−$10.75');
    expect(total()).toBe('$96.75');

    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Cobrar $96.75 en efectivo');
    expect(screen.getByRole('dialog')).toHaveTextContent('Incluye descuento Lab Progress 10%: −$10.75 (subtotal $107.50)');
  });

  it('sin membresía con descuento no aparece nada', () => {
    render(<RegisterScreen data={data()} />);
    add(/Agregar Latte caliente/);
    expect(screen.queryByLabelText('Descuento')).not.toBeInTheDocument();
    expect(total()).toBe('$65.00');
  });
});

