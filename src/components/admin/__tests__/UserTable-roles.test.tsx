import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { expectConfirmBeforeAction } from '@/test-utils/confirm';

vi.mock('@/actions/admin', () => ({ changeUserRoleAction: vi.fn(), deleteUserAction: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { UserTable } from '../UserTable';
import { UserRoleFilter } from '../UserRoleFilter';
import { changeUserRoleAction } from '@/actions/admin';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

/** Rol `barra` en la administración de usuarios (TASK-CF-ROLE-01, D9). */

const users = [
  { id: 'u1', username: 'Ana', email: 'ana@test.com', role: 'client' as const, createdAt: '01/10/2026' },
  { id: 'u2', username: 'Beto', email: 'beto@test.com', role: 'barra' as const, createdAt: '02/10/2026' },
];

beforeEach(() => vi.clearAllMocks());

describe('UserTable — rol barra', () => {
  it('etiqueta a un usuario barra y ofrece la opción Barra', () => {
    render(<UserTable users={users} />);
    expect(screen.getByText('Barra', { selector: 'span' })).toBeInTheDocument();
    const select = screen.getByLabelText('Cambiar rol de Ana');
    expect(within(select).getByRole('option', { name: 'Barra' })).toHaveAttribute('value', 'barra');
  });

  it('cambiar el rol pide confirmación con usuario y rol nuevo', async () => {
    vi.mocked(changeUserRoleAction).mockResolvedValue({ success: true, message: 'Rol actualizado exitosamente.' });
    render(<UserTable users={users} />);
    fireEvent.change(screen.getByLabelText('Cambiar rol de Ana'), { target: { value: 'barra' } });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Ana');
    expect(dialog).toHaveTextContent('Barra');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Cambiar rol de Ana')).toHaveValue('client');

    await expectConfirmBeforeAction({
      trigger: () => fireEvent.change(screen.getByLabelText('Cambiar rol de Ana'), { target: { value: 'barra' } }),
      action: vi.mocked(changeUserRoleAction),
      confirmLabel: 'Sí, cambiar rol',
    });
    expect(changeUserRoleAction).toHaveBeenCalledWith('u1', 'barra');
    await waitFor(() => expect(screen.getByLabelText('Cambiar rol de Ana')).toHaveValue('barra'));
  });
});

describe('UserRoleFilter — rol barra', () => {
  it('muestra el filtro Barra con su conteo', () => {
    render(<UserRoleFilter currentRole="all" counts={{ all: 5, client: 2, coach: 1, admin: 1, barra: 1 }} />);
    expect(screen.getByRole('button', { name: /Barra/ })).toHaveTextContent('1');
  });
});
