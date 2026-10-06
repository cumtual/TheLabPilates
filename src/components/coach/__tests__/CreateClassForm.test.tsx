import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CreateClassForm } from '../CreateClassForm';
import { AdminCreateClassForm } from '@/components/admin/AdminCreateClassForm';

vi.mock('@/actions/coach', () => ({ createClassAction: vi.fn() }));
vi.mock('@/actions/admin', () => ({ adminCreateClassAction: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function typeOptions(): string[] {
  const select = screen.getByLabelText(/tipo de clase/i);
  return within(select)
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value)
    .filter(Boolean);
}

describe('Selector de tipo de clase por rol', () => {
  it('coach ve Sculpt y no ve Personalizada', () => {
    render(<CreateClassForm />);

    expect(typeOptions()).toEqual(['yoga', 'mat_pilates', 'barre', 'sculpt']);
    expect(screen.queryByRole('option', { name: 'Personalizada' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sculpt' })).toBeInTheDocument();
  });

  it('admin ve todos los tipos, incluidos Personalizada y Sculpt', () => {
    render(<AdminCreateClassForm coaches={[{ id: 'c1', username: 'Ana', email: 'ana@test.com' }]} />);

    expect(typeOptions()).toEqual(['yoga', 'mat_pilates', 'barre', 'personalizada', 'sculpt']);
  });
});
