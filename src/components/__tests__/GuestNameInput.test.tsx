import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GuestNameInput } from '../client/GuestNameInput';

describe('GuestNameInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    visible: true,
  };

  describe('Visibility', () => {
    it('renders the input when visible is true', () => {
      render(<GuestNameInput {...defaultProps} visible={true} />);
      expect(screen.getByLabelText('Nombre completo del invitado')).toBeInTheDocument();
    });

    it('renders nothing when visible is false', () => {
      const { container } = render(<GuestNameInput {...defaultProps} visible={false} />);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('Input behavior', () => {
    it('displays the correct placeholder text', () => {
      render(<GuestNameInput {...defaultProps} />);
      expect(screen.getByPlaceholderText('Ej. María García')).toBeInTheDocument();
    });

    it('calls onChange when user types', () => {
      const onChange = vi.fn();
      render(<GuestNameInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.change(input, { target: { value: 'Carlos López' } });
      expect(onChange).toHaveBeenCalledWith('Carlos López');
    });

    it('displays the current value', () => {
      render(<GuestNameInput {...defaultProps} value="Ana Martínez" />);
      const input = screen.getByLabelText('Nombre completo del invitado') as HTMLInputElement;
      expect(input.value).toBe('Ana Martínez');
    });
  });

  describe('Validation: name too short', () => {
    it('shows error for a single character after blur', () => {
      render(<GuestNameInput {...defaultProps} value="A" />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      expect(screen.getByText('El nombre debe tener al menos 2 caracteres.')).toBeInTheDocument();
    });

    it('does not show error before blur (untouched)', () => {
      render(<GuestNameInput {...defaultProps} value="A" />);
      expect(screen.queryByText('El nombre debe tener al menos 2 caracteres.')).toBeNull();
    });
  });

  describe('Validation: name too long', () => {
    it('shows error for name exceeding 100 characters after blur', () => {
      const longName = 'A'.repeat(101);
      render(<GuestNameInput {...defaultProps} value={longName} />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      expect(screen.getByText('El nombre no puede exceder 100 caracteres.')).toBeInTheDocument();
    });
  });

  describe('Validation: invalid characters', () => {
    it('shows error for name with numbers after blur', () => {
      render(<GuestNameInput {...defaultProps} value="Carlos123" />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      expect(screen.getByText('Solo se permiten letras y espacios.')).toBeInTheDocument();
    });

    it('shows error for name with special characters after blur', () => {
      render(<GuestNameInput {...defaultProps} value="María@García" />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      expect(screen.getByText('Solo se permiten letras y espacios.')).toBeInTheDocument();
    });
  });

  describe('Validation: valid names', () => {
    it('does not show error for a valid name after blur', () => {
      render(<GuestNameInput {...defaultProps} value="Carlos López" />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('does not show error for accented characters', () => {
      render(<GuestNameInput {...defaultProps} value="José Ñoño García" />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('does not show error for name at exactly 2 characters', () => {
      render(<GuestNameInput {...defaultProps} value="An" />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('does not show error for name at exactly 100 characters', () => {
      const validName = 'A'.repeat(100);
      render(<GuestNameInput {...defaultProps} value={validName} />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('External error prop', () => {
    it('displays external error when provided', () => {
      render(
        <GuestNameInput {...defaultProps} value="Ana" error="Error del servidor" />
      );
      expect(screen.getByText('Error del servidor')).toBeInTheDocument();
    });

    it('external error takes priority over validation error', () => {
      render(
        <GuestNameInput {...defaultProps} value="A" error="Error del servidor" />
      );
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      // External error is shown, not the validation error
      expect(screen.getByText('Error del servidor')).toBeInTheDocument();
      expect(screen.queryByText('El nombre debe tener al menos 2 caracteres.')).toBeNull();
    });
  });

  describe('Empty value (no validation on empty before submit)', () => {
    it('does not show validation error for empty value after blur', () => {
      render(<GuestNameInput {...defaultProps} value="" />);
      const input = screen.getByLabelText('Nombre completo del invitado');
      fireEvent.blur(input);
      // Empty is handled separately — no inline error shown for empty field
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
