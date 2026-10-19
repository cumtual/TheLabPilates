import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MyCourtesiesCard } from '../MyCourtesiesCard';

vi.mock('@/modules/cafeteria/presentation/queries', () => ({ loadMyCourtesies: vi.fn() }));

import { loadMyCourtesies } from '@/modules/cafeteria/presentation/queries';
import { MyCourtesiesSection } from '../MyCourtesiesSection';

/** «Mis cortesías» (SPEC-CAFETERIA D12, TASK-CF-CLI-01). */
describe('MyCourtesiesCard', () => {
  it('muestra regalos con alcance, restantes y vencimiento CDMX, y el cupo del coach', () => {
    render(
      <MyCourtesiesCard
        courtesies={{
          monthly: { remaining: 3, limit: 4 },
          grants: [{ id: 'g1', scopeLabel: 'Comida › Postres', remaining: 1, quantity: 2, expiresAt: new Date('2026-10-20T23:59:59.999-06:00') }],
        }}
      />
    );
    expect(screen.getByText('Comida › Postres · 1 de 2 · vence 20/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Te quedan 3 de 4 este mes')).toBeInTheDocument();
  });

  it('sin cortesías no se muestra', () => {
    const { container } = render(<MyCourtesiesCard courtesies={{ monthly: null, grants: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('si la consulta falla, la sección no rompe el dashboard', async () => {
    vi.mocked(loadMyCourtesies).mockRejectedValue(new Error('db'));
    expect(await MyCourtesiesSection()).toBeNull();
  });

  it('aparece en el dashboard de client y de coach', () => {
    for (const role of ['client', 'coach']) {
      const source = readFileSync(resolve(process.cwd(), `src/app/(portal)/${role}/page.tsx`), 'utf8');
      expect(source).toContain('<MyCourtesiesSection />');
    }
  });
});
