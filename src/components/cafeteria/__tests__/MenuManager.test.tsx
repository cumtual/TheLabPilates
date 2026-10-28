import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { sampleCategories, sampleProducts } from '@/modules/cafeteria/domain/__tests__/fixtures';
import { expectConfirmBeforeAction } from '@/test-utils/confirm';

vi.mock('@/modules/cafeteria/presentation/actions/menu', () => ({
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  deleteProductAction: vi.fn(),
  setProductAvailabilityAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import * as actions from '@/modules/cafeteria/presentation/actions/menu';
import { MenuManager } from '../MenuManager';

/** Menú del admin (SPEC-CAFETERIA D9, D10, A1, TASK-CF-ADM-02). */

const menu = { categories: sampleCategories, products: sampleProducts };
const ok = { success: true as const, data: undefined, message: 'Listo.' };

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(actions)) vi.mocked(fn).mockResolvedValue(ok as never);
});

const within_ = (testId: string) => within(screen.getByTestId(testId));

describe('árbol', () => {
  it('padres con sus subcategorías; «Nueva subcategoría» solo en padres', () => {
    render(<MenuManager menu={menu} />);
    expect(within_('category-bebidas').getByText('Café')).toBeInTheDocument();
    expect(within_('category-comida').getByText('Postres')).toBeInTheDocument();
    expect(within_('category-postres').queryByRole('button', { name: 'Nueva subcategoría' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Nueva subcategoría' })).toHaveLength(2);
  });

  it('«Usa temperatura» solo al crear o editar un padre; una categoría con hijas no se puede mover', () => {
    render(<MenuManager menu={menu} />);
    within_('category-comida').getAllByRole('button', { name: 'Nueva subcategoría' })[0].click();
    expect(screen.queryByLabelText(/Usa temperatura/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nueva categoría' }));
    expect(screen.getByLabelText(/Usa temperatura/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('category-bebidas')).getAllByRole('button', { name: 'Editar' })[0]);
    expect(screen.getByLabelText('Nivel')).toBeDisabled();
  });
});

describe('formulario de producto', () => {
  it('precio con centavos; más de 2 decimales → mensaje en el campo', () => {
    render(<MenuManager menu={menu} />);
    fireEvent.click(within_('category-postres').getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Pay' } });
    fireEvent.change(screen.getByLabelText('Precio (MXN)'), { target: { value: '42.555' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Usa máximo 2 decimales.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Frío / Caliente solo y obligatorio si la categoría usa temperatura; se limpia al pasar a comida', () => {
    render(<MenuManager menu={menu} />);
    fireEvent.click(within_('category-cafe').getByRole('button', { name: 'Nuevo producto' }));
    expect(screen.getByLabelText('Temperatura')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mocha' } });
    fireEvent.change(screen.getByLabelText('Precio (MXN)'), { target: { value: '72.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Elige si es frío o caliente.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Temperatura'), { target: { value: 'hot' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'postres' } });
    expect(screen.queryByLabelText('Temperatura')).not.toBeInTheDocument();
  });
});

describe('confirmaciones (D9)', () => {
  it('crear producto: resumen con nombre, categoría, temperatura y precio; no llama hasta confirmar', async () => {
    render(<MenuManager menu={menu} />);
    fireEvent.click(within_('category-cafe').getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mocha' } });
    fireEvent.change(screen.getByLabelText('Precio (MXN)'), { target: { value: '72.5' } });
    fireEvent.change(screen.getByLabelText('Temperatura'), { target: { value: 'cold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    for (const text of ['Mocha', 'Bebidas › Café', 'frío', '$72.50']) expect(screen.getByRole('dialog')).toHaveTextContent(text);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })),
      action: vi.mocked(actions.createProductAction),
      confirmLabel: 'Sí, guardar',
    });
    expect(actions.createProductAction).toHaveBeenCalledWith({ categoryId: 'cafe', name: 'Mocha', price: '72.5', temperature: 'cold', sortOrder: 0, isActive: true, isAvailable: true });
  });

  it('crear subcategoría pide confirmación', async () => {
    render(<MenuManager menu={menu} />);
    fireEvent.click(within_('category-comida').getAllByRole('button', { name: 'Nueva subcategoría' })[0]);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ensaladas' } });
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })),
      action: vi.mocked(actions.createCategoryAction),
      confirmLabel: 'Sí, guardar',
    });
    expect(actions.createCategoryAction).toHaveBeenCalledWith({ name: 'Ensaladas', parentId: 'comida', usesTemperature: false, sortOrder: 0, isActive: true });
  });

  it('editar y eliminar producto piden confirmación', async () => {
    render(<MenuManager menu={menu} />);
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(within_('product-brownie').getByRole('button', { name: 'Eliminar' })),
      action: vi.mocked(actions.deleteProductAction),
      confirmLabel: 'Sí, eliminar',
    });
    fireEvent.click(within_('product-brownie').getByRole('button', { name: 'Editar' }));
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })),
      action: vi.mocked(actions.updateProductAction),
      confirmLabel: 'Sí, guardar',
    });
  });

  it('eliminar una categoría con hijos muestra el motivo y no llama a nada', () => {
    render(<MenuManager menu={menu} />);
    fireEvent.click(within_('category-comida').getAllByRole('button', { name: 'Eliminar' })[0]);
    expect(screen.getByRole('dialog')).toHaveTextContent('Tiene 2 subcategorías');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Entendido' }));
    expect(actions.deleteCategoryAction).not.toHaveBeenCalled();
  });

  it('eliminar una categoría vacía pide confirmación', async () => {
    render(<MenuManager menu={{ categories: sampleCategories, products: sampleProducts.filter((p) => p.categoryId !== 'sandwiches') }} />);
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(within_('category-sandwiches').getByRole('button', { name: 'Eliminar' })),
      action: vi.mocked(actions.deleteCategoryAction),
      confirmLabel: 'Sí, eliminar',
    });
  });

  it('marcar agotado no pide confirmación', async () => {
    render(<MenuManager menu={menu} />);
    fireEvent.click(within_('product-brownie').getByRole('button', { name: 'Marcar agotado' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(actions.setProductAvailabilityAction).toHaveBeenCalledWith('brownie', false));
  });

  it('los errores del servidor aparecen bajo su campo', async () => {
    vi.mocked(actions.createProductAction).mockResolvedValue({ success: false, error: 'Ya existe.', field: 'name', fieldErrors: { name: 'Ya existe un producto con ese nombre en la categoría.' } });
    render(<MenuManager menu={menu} />);
    fireEvent.click(within_('category-postres').getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Brownie' } });
    fireEvent.change(screen.getByLabelText('Precio (MXN)'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, guardar' }));
    expect(await screen.findByText('Ya existe un producto con ese nombre en la categoría.')).toBeInTheDocument();
  });
});
