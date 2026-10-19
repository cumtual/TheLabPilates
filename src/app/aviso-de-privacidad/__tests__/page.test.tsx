import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/layout/Navbar', () => ({ default: () => null }));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));

import PrivacyPage from '../page';

/** Aviso de privacidad: datos de la cafetería (SPEC-CAFETERIA §9, TASK-CF-DOC-01). */
describe('/aviso-de-privacidad — cafetería', () => {
  it('menciona el nombre del pedido y las compras de usuarios registrados, y la finalidad', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Consumos en la cafetería');
    expect(text).toMatch(/el pedido queda asociado a su\s+cuenta/);
    expect(text).toMatch(/se guarda ese nombre/);
    expect(text).toContain('Venta en la cafetería, corte de caja y control de cortesías.');
    expect(screen.getByText(/Última actualización: 15 de octubre de 2026/)).toBeInTheDocument();
  });
});
