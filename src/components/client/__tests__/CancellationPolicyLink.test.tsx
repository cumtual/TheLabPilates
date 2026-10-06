import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CancellationModal } from '../CancellationModal';

/** Art. 76 BIS LFPC: la política se informa antes de confirmar la cancelación tardía. */
describe('Aviso de cancelación tardía', () => {
  it('enlaza a la política de cancelación en Términos y Condiciones', () => {
    render(<CancellationModal isOpen onClose={() => {}} onConfirm={() => {}} />);
    const link = screen.getByRole('link', { name: 'Ver política de cancelación' });
    expect(link).toHaveAttribute('href', '/terminos-y-condiciones');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('menciona la tolerancia de 10 minutos ya vencida', () => {
    render(<CancellationModal isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/pasaron más de 10 minutos desde que reservaste/)).toBeInTheDocument();
  });
});
