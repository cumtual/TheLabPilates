import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminRemoveGuestButton } from '../admin/AdminRemoveGuestButton';

// Mock the server action
vi.mock('@/actions/admin-guest', () => ({
  adminRemoveGuestAction: vi.fn(),
}));

// Mock createPortal so Modal renders inline for testing
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

import { adminRemoveGuestAction } from '@/actions/admin-guest';

const mockedAction = vi.mocked(adminRemoveGuestAction);

describe('AdminRemoveGuestButton', () => {
  const defaultProps = {
    guestEnrollmentId: 'guest-123',
    guestName: 'Juan Pérez',
    origin: 'admin' as const,
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('When origin is "user"', () => {
    it('renders a disabled button', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="user" />
      );
      const button = screen.getByRole('button', { name: /no se puede eliminar/i });
      expect(button).toBeDisabled();
    });

    it('shows tooltip text "No se puede eliminar" on hover', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="user" />
      );
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('No se puede eliminar');
    });

    it('does not open confirmation dialog when clicked', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="user" />
      );
      const button = screen.getByRole('button', { name: /no se puede eliminar/i });
      fireEvent.click(button);
      expect(screen.queryByText(/¿Estás seguro/)).not.toBeInTheDocument();
    });
  });

  describe('When origin is "admin"', () => {
    it('renders an enabled button', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      const button = screen.getByRole('button', { name: /eliminar invitado juan/i });
      expect(button).not.toBeDisabled();
    });

    it('does not show tooltip', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('opens confirmation dialog when clicked', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      fireEvent.click(screen.getByRole('button', { name: /eliminar invitado juan/i }));
      expect(
        screen.getByText(/¿Estás seguro de eliminar al invitado/)
      ).toBeInTheDocument();
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    it('shows "Cancelar" and "Eliminar" buttons in confirmation dialog', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      fireEvent.click(screen.getByRole('button', { name: /eliminar invitado juan/i }));
      expect(screen.getByText('Cancelar')).toBeInTheDocument();
      expect(
        screen.getAllByText('Eliminar').length
      ).toBeGreaterThanOrEqual(1);
    });

    it('closes confirmation dialog when "Cancelar" is clicked', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      fireEvent.click(screen.getByRole('button', { name: /eliminar invitado juan/i }));
      fireEvent.click(screen.getByText('Cancelar'));
      expect(
        screen.queryByText(/¿Estás seguro de eliminar al invitado/)
      ).not.toBeInTheDocument();
    });

    it('calls adminRemoveGuestAction on confirm and invokes onSuccess', async () => {
      mockedAction.mockResolvedValue({ success: true, message: 'Invitado eliminado exitosamente.' });

      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      fireEvent.click(screen.getByRole('button', { name: /eliminar invitado juan/i }));

      // Find the confirm button inside the dialog (the one within the modal actions)
      const confirmButtons = screen.getAllByText('Eliminar');
      const dialogConfirmButton = confirmButtons[confirmButtons.length - 1];
      fireEvent.click(dialogConfirmButton);

      await waitFor(() => {
        expect(mockedAction).toHaveBeenCalledWith('guest-123');
      });
      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it('shows inline error message on action failure', async () => {
      mockedAction.mockResolvedValue({
        success: false,
        error: 'Solo puedes eliminar invitados registrados por administrador.',
      });

      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      fireEvent.click(screen.getByRole('button', { name: /eliminar invitado juan/i }));

      const confirmButtons = screen.getAllByText('Eliminar');
      const dialogConfirmButton = confirmButtons[confirmButtons.length - 1];
      fireEvent.click(dialogConfirmButton);

      await waitFor(() => {
        expect(
          screen.getByText('Solo puedes eliminar invitados registrados por administrador.')
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    });

    it('does not call onSuccess when not provided', async () => {
      mockedAction.mockResolvedValue({ success: true, message: 'OK' });

      render(
        <AdminRemoveGuestButton
          guestEnrollmentId="guest-123"
          guestName="Juan Pérez"
          origin="admin"
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /eliminar invitado juan/i }));

      const confirmButtons = screen.getAllByText('Eliminar');
      const dialogConfirmButton = confirmButtons[confirmButtons.length - 1];
      fireEvent.click(dialogConfirmButton);

      await waitFor(() => {
        expect(mockedAction).toHaveBeenCalledWith('guest-123');
      });
    });
  });

  describe('Accessibility', () => {
    it('has min-h-11 and min-w-11 classes for 44x44px touch target', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      const button = screen.getByRole('button', { name: /eliminar invitado juan/i });
      expect(button.className).toContain('min-h-11');
      expect(button.className).toContain('min-w-11');
    });

    it('has focus-visible outline classes for keyboard accessibility', () => {
      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      const button = screen.getByRole('button', { name: /eliminar invitado juan/i });
      expect(button.className).toContain('focus-visible:outline-2');
    });

    it('error message has role="alert" for screen readers', async () => {
      mockedAction.mockResolvedValue({
        success: false,
        error: 'Error de prueba.',
      });

      render(
        <AdminRemoveGuestButton {...defaultProps} origin="admin" />
      );
      fireEvent.click(screen.getByRole('button', { name: /eliminar invitado juan/i }));

      const confirmButtons = screen.getAllByText('Eliminar');
      fireEvent.click(confirmButtons[confirmButtons.length - 1]);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Error de prueba.');
      });
    });
  });
});
