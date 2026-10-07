import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/** Indicador de crédito en la lista de clases (SPEC-SPECIAL-PACKAGES §8.3). */

vi.mock('../EnrollWithGuestSection', () => ({ EnrollWithGuestSection: ({ classId }: { classId: string }) => <button type="button">Reservar {classId}</button> }));

import { ClassList } from '../ClassList';
import { creditHintFor } from '@/lib/subscription/rules';

const at = (hhmm: string) => new Date(`2026-10-09T${hhmm}:00-06:00`);
const balances = [
  { id: 'A', label: null, allowedClassTypes: ['yoga'] as const, windowStart: null, windowEnd: null, creditsRemaining: 1, creditsTotal: 1, sortOrder: 0 },
  { id: 'B', label: null, allowedClassTypes: ['mat_pilates', 'barre'] as const, windowStart: null, windowEnd: null, creditsRemaining: 0, creditsTotal: 1, sortOrder: 1 },
];
const item = (id: string, classType: string) => ({
  id, classDate: at('09:00'), classType, capacity: 10, enrolledCount: 2, coachName: 'Ana',
  creditHint: creditHintFor(balances, { classType, classDate: at('09:00') }, 'Reset Pass'),
});

describe('ClassList — paquete especial', () => {
  it('una clase reservable indica qué crédito usa', () => {
    render(<ClassList classes={[item('yoga-1', 'yoga')]} />);
    expect(screen.getByTestId('credit-hint-yoga-1')).toHaveTextContent('Usa: 1 clase de Yoga');
    expect(screen.getByRole('button', { name: 'Reservar yoga-1' })).toBeEnabled();
  });

  it('una no reservable deshabilita el botón y explica el motivo', () => {
    render(<ClassList classes={[item('barre-1', 'barre')]} />);
    expect(screen.getByTestId('credit-hint-barre-1')).toHaveTextContent('Tu Reset Pass ya no incluye clases de Mat Pilates / Barre. Te queda: 1 clase de Yoga.');
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeDisabled();
  });

  it('sin paquete especial no cambia nada', () => {
    render(<ClassList classes={[{ ...item('yoga-1', 'yoga'), creditHint: undefined }]} />);
    expect(screen.queryByTestId('credit-hint-yoga-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reservar yoga-1' })).toBeEnabled();
  });
});
