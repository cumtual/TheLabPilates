import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { indexCategories } from '@/modules/cafeteria/domain/category-tree';
import { effectiveCourtesyEligibility } from '@/modules/cafeteria/domain/courtesy';
import { sampleCategories, sampleProducts } from '@/modules/cafeteria/domain/__tests__/fixtures';
import { expectConfirmBeforeAction } from '@/test-utils/confirm';

vi.mock('@/modules/cafeteria/presentation/actions/admin', () => ({ updateCourtesyRulesAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { updateCourtesyRulesAction } from '@/modules/cafeteria/presentation/actions/admin';
import { CourtesyRules } from '../CourtesyRules';

/** Reglas de cortesía (SPEC-CAFETERIA D3, TASK-CF-ADM-03). */

const index = indexCategories(sampleCategories);
const rules = {
  limit: 4,
  notifyEmails: ['thelabpilates77@gmail.com'],
  categories: sampleCategories,
  products: sampleProducts.map((p) => ({ ...p, effective: effectiveCourtesyEligibility(p, index) })),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateCourtesyRulesAction).mockResolvedValue({ success: true, data: undefined });
});

describe('CourtesyRules', () => {
  it('tri-estado por nodo y elegibilidad efectiva en vivo con su origen', () => {
    render(<CourtesyRules rules={rules} />);
    const latte = () => within(screen.getByTestId('rule-product-latte-hot'));
    expect(latte().getByText('No · sin regla')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cortesía de Bebidas'), { target: { value: 'yes' } });
    expect(latte().getByText('Sí · por la categoría padre')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cortesía de Café'), { target: { value: 'no' } });
    expect(latte().getByText('No · por la subcategoría')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cortesía de Latte (caliente)'), { target: { value: 'yes' } });
    expect(latte().getByText('Sí · por el producto')).toBeInTheDocument();
  });

  it('límite 0–31 y al menos un correo válido', () => {
    render(<CourtesyRules rules={rules} />);
    fireEvent.change(screen.getByLabelText('Cortesías por coach al mes'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reglas' }));
    expect(screen.getByText('El límite va de 0 a 31.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nuevo correo'), { target: { value: 'malo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByText('Correo no válido.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cortesías por coach al mes'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar thelabpilates77@gmail.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reglas' }));
    expect(screen.getByText('Agrega al menos un correo.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('guardar pide confirmación con el resumen y envía solo lo que cambió', async () => {
    render(<CourtesyRules rules={rules} />);
    fireEvent.change(screen.getByLabelText('Cortesías por coach al mes'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Cortesía de Bebidas'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('Cortesía de Agua (fría)'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('Nuevo correo'), { target: { value: 'Caja@Lab.mx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reglas' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Límite mensual: 4 → 6');
    expect(dialog).toHaveTextContent('1 categorías y 1 productos cambian');
    expect(dialog).toHaveTextContent('thelabpilates77@gmail.com, caja@lab.mx');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await expectConfirmBeforeAction({
      trigger: () => fireEvent.click(screen.getByRole('button', { name: 'Guardar reglas' })),
      action: vi.mocked(updateCourtesyRulesAction),
      confirmLabel: 'Sí, guardar',
    });
    expect(updateCourtesyRulesAction).toHaveBeenCalledWith({
      limit: 6,
      notifyEmails: ['thelabpilates77@gmail.com', 'caja@lab.mx'],
      categories: [{ id: 'bebidas', eligible: true }],
      products: [{ id: 'agua', override: false }],
    });
  });
});
