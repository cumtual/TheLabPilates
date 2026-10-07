import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/** Aviso antes de comprar otro paquete (SPEC-SPECIAL-PACKAGES §6.2, D2, S1, S3). */

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { ActiveSubscriptionWarning } from '../ActiveSubscriptionWarning';

describe('ActiveSubscriptionWarning', () => {
  it('ya no promete acumular créditos y explica que el paquete actual vencerá', () => {
    const { container } = render(<ActiveSubscriptionWarning packageName="Lab Entry" credits={3} expiration="12/10/2026" />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/acumular/);
    expect(text).toContain(
      'Al confirmarse el pago de tu nuevo paquete, tu suscripción actual (Lab Entry · 3 créditos · vence 12/10/2026) pasará a vencida y los créditos restantes no se reembolsan ni se transfieren. Tus reservas ya hechas se mantienen.'
    );
  });

  it('Open Lab: describe las clases ilimitadas', () => {
    const { container } = render(<ActiveSubscriptionWarning packageName="Open Lab" credits={0} expiration="12/10/2026" isOpenLab />);
    expect(container.textContent).toContain('(Open Lab · clases ilimitadas · vence 12/10/2026)');
  });

  it('mantiene la confirmación explícita antes de comprar', () => {
    render(<ActiveSubscriptionWarning packageName="Lab Entry" credits={1} expiration={null} />);
    expect(screen.getByRole('link', { name: 'Sí, deseo comprar otro paquete' })).toHaveAttribute('href', '/client/subscription?continue=1');
    expect(screen.getByText(/Lab Entry · 1 crédito\)/)).toBeInTheDocument();
  });
});
