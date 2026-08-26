import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminAddGuestForm } from '../admin/AdminAddGuestForm';

// Mock the server action
vi.mock('@/actions/admin-guest', () => ({
  adminAddGuestAction: vi.fn(),
}));

import { adminAddGuestAction } from '@/actions/admin-guest';

const mockedAction = vi.mocked(adminAddGuestAction);

describe('AdminAddGuestForm', () => {
  const defaultProps = {
    classId: 'class-abc-123',
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Collapsed state (initial)', () => {
    it('renders "+ Agregar Invitado" button initially (Req 6.2)', () => {
      render(<AdminAddGuestForm {...defaultProps} />);

      const button = screen.getByRole('button', {
        name: /agregar invitado/i,
      });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Agregar Invitado');
    });

    it('does not show the form fields initially', () => {
      render(<AdminAddGuestForm {...defaultProps} />);

      expect(
        screen.queryByLabelText(/nombre del invitado/i)
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Confirmar')).not.toBeInTheDocument();
      expect(screen.queryByText('Cancelar')).not.toBeInTheDocument();
    });
  });

  describe('Expanded state (form visible)', () => {
    it('expands form when "+ Agregar Invitado" button is clicked (Req 6.2)', () => {
      render(<AdminAddGuestForm {...defaultProps} />);

      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      expect(
        screen.getByLabelText(/nombre del invitado/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Confirmar')).toBeInTheDocument();
      expect(screen.getByText('Cancelar')).toBeInTheDocument();
    });

    it('shows "Nombre del invitado" input field with label', () => {
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('placeholder', 'Nombre completo');
    });

    it('collapses form and clears input when "Cancelar" is clicked', () => {
      render(<AdminAddGuestForm {...defaultProps} />);

      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );
      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'Test Name' } });

      fireEvent.click(screen.getByText('Cancelar'));

      expect(
        screen.queryByLabelText(/nombre del invitado/i)
      ).not.toBeInTheDocument();
      // Should be back to collapsed state
      expect(
        screen.getByRole('button', { name: /agregar invitado/i })
      ).toBeInTheDocument();
    });
  });

  describe('Client-side validation (Req 6.3)', () => {
    it('shows error when name is empty on submit', () => {
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      // Submit with empty name
      fireEvent.click(screen.getByText('Confirmar'));

      expect(
        screen.getByText('El nombre del invitado es obligatorio.')
      ).toBeInTheDocument();
      expect(mockedAction).not.toHaveBeenCalled();
    });

    it('shows error when name is only whitespace', () => {
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(screen.getByText('Confirmar'));

      expect(
        screen.getByText('El nombre del invitado es obligatorio.')
      ).toBeInTheDocument();
      expect(mockedAction).not.toHaveBeenCalled();
    });

    it('shows error when name exceeds 100 characters', () => {
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      const longName = 'A'.repeat(101);
      fireEvent.change(input, { target: { value: longName } });
      fireEvent.click(screen.getByText('Confirmar'));

      expect(
        screen.getByText(
          'El nombre del invitado no puede exceder 100 caracteres.'
        )
      ).toBeInTheDocument();
      expect(mockedAction).not.toHaveBeenCalled();
    });

    it('accepts names between 1 and 100 characters (admin min is 1)', async () => {
      mockedAction.mockResolvedValue({
        success: true,
        message: '¡Invitado agregado exitosamente!',
      });
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'A' } });
      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(mockedAction).toHaveBeenCalledWith('class-abc-123', 'A');
      });
    });

    it('clears field error when user types', () => {
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      // Trigger error
      fireEvent.click(screen.getByText('Confirmar'));
      expect(
        screen.getByText('El nombre del invitado es obligatorio.')
      ).toBeInTheDocument();

      // Start typing — error should clear
      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'M' } });

      expect(
        screen.queryByText('El nombre del invitado es obligatorio.')
      ).not.toBeInTheDocument();
    });
  });

  describe('Successful submission', () => {
    it('calls adminAddGuestAction with classId and trimmed name', async () => {
      mockedAction.mockResolvedValue({
        success: true,
        message: '¡Invitado agregado exitosamente!',
      });
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: '  María García  ' } });
      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(mockedAction).toHaveBeenCalledWith(
          'class-abc-123',
          'María García'
        );
      });
    });

    it('collapses form and calls onSuccess after successful action', async () => {
      mockedAction.mockResolvedValue({
        success: true,
        message: '¡Invitado agregado exitosamente!',
      });
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'Carlos López' } });
      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
      });
      // Should be collapsed again
      expect(
        screen.queryByLabelText(/nombre del invitado/i)
      ).not.toBeInTheDocument();
    });

    it('shows success message after successful submission', async () => {
      mockedAction.mockResolvedValue({
        success: true,
        message: '¡Invitado agregado exitosamente!',
      });
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'Ana Torres' } });
      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(
          screen.getByText('¡Invitado agregado exitosamente!')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Server-side errors', () => {
    it('shows error when class has no capacity (Req 6.5)', async () => {
      mockedAction.mockResolvedValue({
        success: false,
        error: 'No hay cupos disponibles.',
      });
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'Pedro Martínez' } });
      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(
          screen.getByText('No hay cupos disponibles.')
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    });

    it('shows field error when server rejects guest name', async () => {
      mockedAction.mockResolvedValue({
        success: false,
        error: 'El nombre del invitado es obligatorio.',
        field: 'guestName',
      });
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'X' } });
      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(
          screen.getByText('El nombre del invitado es obligatorio.')
        ).toBeInTheDocument();
      });
    });

    it('shows generic error on action throw', async () => {
      mockedAction.mockRejectedValue(new Error('Network error'));
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'Roberto Silva' } });
      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        expect(
          screen.getByText(
            'No se pudo agregar el invitado. Intenta de nuevo.'
          )
        ).toBeInTheDocument();
      });
    });

    it('error message has role="alert" for accessibility', async () => {
      mockedAction.mockResolvedValue({
        success: false,
        error: 'No hay cupos disponibles.',
      });
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(screen.getByText('Confirmar'));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('No hay cupos disponibles.');
      });
    });
  });

  describe('Accessibility', () => {
    it('form has accessible aria-label', () => {
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      expect(
        screen.getByLabelText('Formulario para agregar invitado')
      ).toBeInTheDocument();
    });

    it('input has aria-required attribute', () => {
      render(<AdminAddGuestForm {...defaultProps} />);
      fireEvent.click(
        screen.getByRole('button', { name: /agregar invitado/i })
      );

      const input = screen.getByLabelText(/nombre del invitado/i);
      expect(input).toHaveAttribute('aria-required', 'true');
    });

    it('"+ Agregar Invitado" button has accessible aria-label', () => {
      render(<AdminAddGuestForm {...defaultProps} />);

      const button = screen.getByRole('button', {
        name: 'Agregar invitado a la clase',
      });
      expect(button).toBeInTheDocument();
    });

    it('buttons meet min 44x44 touch target (min-h-11 / min-w-11 classes)', () => {
      render(<AdminAddGuestForm {...defaultProps} />);

      const addButton = screen.getByRole('button', {
        name: /agregar invitado/i,
      });
      expect(addButton.className).toContain('min-h-11');
      expect(addButton.className).toContain('min-w-11');
    });
  });
});
