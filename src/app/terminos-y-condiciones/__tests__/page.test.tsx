import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TermsPage, { metadata } from '@/app/terminos-y-condiciones/page';
import { GRACE_PERIOD_MINUTES } from '@/lib/utils/date';

/**
 * Cláusula de cancelación (SPEC-CANCELLATION-AUDIT-AND-TERMS §5.2). El texto
 * debe coincidir con la lógica real: ≥24 h reembolsa, ≤10 min tras reservar
 * reembolsa, fuera de ambos es cancelación tardía sin reposición.
 */

function sectionText() {
  render(<TermsPage />);
  const heading = screen.getByRole('heading', { name: /Política de cancelaciones y reembolso de créditos/i });
  return heading.closest('section')?.textContent ?? heading.parentElement?.textContent ?? '';
}

describe('/terminos-y-condiciones — política de cancelación', () => {
  it('conserva la regla general de 24 horas con reintegro del crédito', () => {
    const text = sectionText();
    expect(text).toContain('veinticuatro (24) horas de anticipación');
    expect(text).toMatch(/Crédito se reintegra en su totalidad/);
  });

  it(`incluye el periodo de tolerancia de ${GRACE_PERIOD_MINUTES} minutos contados desde la reserva`, () => {
    const text = sectionText();
    expect(GRACE_PERIOD_MINUTES).toBe(10);
    expect(text).toContain('diez (10) minutos');
    expect(text).toContain('Hora de la Reserva');
    expect(text).toMatch(/aun cuando falten menos de veinticuatro \(24\) horas/);
  });

  it('define la cancelación tardía sin reposición tras la tolerancia', () => {
    const text = sectionText();
    expect(text).toMatch(/cancelación tardía/i);
    expect(text).toMatch(/no da derecho a la reposición del Crédito/);
  });

  it('cubre invitados, cancelación por el Estudio, horario CDMX y derechos ante PROFECO', () => {
    const text = sectionText();
    expect(text).toMatch(/invitados/i);
    expect(text).toMatch(/Estudio cancela una clase/);
    expect(text).toContain('Ciudad de México');
    expect(text).toContain('PROFECO');
  });

  it('actualiza la fecha de última actualización y conserva el título', () => {
    render(<TermsPage />);
    expect(screen.getByText(/Última actualización: 24 de septiembre de 2026/)).toBeInTheDocument();
    expect(metadata.title).toBe('Términos y Condiciones');
  });
});
