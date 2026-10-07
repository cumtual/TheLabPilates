import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TermsPage, { metadata } from '@/app/terminos-y-condiciones/page';
import { GRACE_PERIOD_MINUTES } from '@/lib/utils/date';

/**
 * Cláusula de cancelación (SPEC-CANCELLATION-AUDIT-AND-TERMS §5.2). El texto
 * debe coincidir con la lógica real: ≥24 h reembolsa, ≤10 min tras reservar
 * reembolsa, fuera de ambos es cancelación tardía sin reposición.
 */

function textOfSection(name: RegExp) {
  render(<TermsPage />);
  const heading = screen.getByRole('heading', { name });
  return heading.closest('section')?.textContent ?? heading.parentElement?.textContent ?? '';
}

function sectionText() {
  return textOfSection(/Política de cancelaciones y reembolso de créditos/i);
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
    expect(screen.getByText(/Última actualización: 7 de octubre de 2026/)).toBeInTheDocument();
    expect(metadata.title).toBe('Términos y Condiciones');
  });
});

/**
 * Paquetes especiales y cambio de paquete (SPEC-SPECIAL-PACKAGES §10, D2–D7).
 */
describe('/terminos-y-condiciones — paquetes y suscripciones', () => {
  const membershipSection = () => textOfSection(/Membresías y paquetes de créditos/i);

  it('la vigencia de los paquetes por créditos cuenta desde la confirmación del pago', () => {
    const text = membershipSection();
    expect(text).toContain('treinta (30) días naturales contados a partir de la confirmación del pago');
    expect(text).toMatch(/concluyan las clases ya reservadas/);
  });

  it('describe los paquetes especiales: vigencia propia, disciplinas, combinaciones, franja horaria e invitados', () => {
    const text = membershipSection();
    expect(text).toContain('Paquetes especiales');
    expect(text).toMatch(/vigencia propia/);
    expect(text).toMatch(/Mat Pilates o Barre/);
    expect(text).toMatch(/hora de inicio de la clase/);
    expect(text).toMatch(/no son intercambiables entre grupos/);
    expect(text).toMatch(/pases de invitado/);
  });

  it('establece una sola suscripción vigente y las consecuencias del cambio de paquete', () => {
    const text = membershipSection();
    expect(text).toContain('Cambio de paquete');
    expect(text).toMatch(/una sola suscripción vigente/);
    expect(text).toMatch(/al confirmarse el pago/i);
    expect(text).toMatch(/no son reembolsables ni transferibles/);
    expect(text).toMatch(/Reservas ya realizadas se conservan/);
    expect(text).toMatch(/no se reintegra/);
  });

  it('las condiciones de lo comprado no cambian con ediciones posteriores del catálogo', () => {
    expect(membershipSection()).toMatch(/condiciones publicadas al momento de la compra/);
  });

  it('a cada compra le aplica el precio vigente al registrarla', () => {
    expect(textOfSection(/Precios y pagos/i)).toMatch(/precio vigente al momento de registrar la compra/);
  });

  it('la cancelación reintegra al mismo grupo y el Estudio repone si la suscripción ya no está vigente', () => {
    const text = sectionText();
    expect(text).toMatch(/mismo grupo de disciplinas/);
    expect(text).toMatch(/ya no está vigente, el Estudio repondrá la sesión/);
  });
});
