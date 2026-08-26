import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelGuestDialog } from '../client/CancelGuestDialog';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock server actions
const mockCancelGuestAction = vi.fn();
const mockCancelReservationWithGuestAction = vi.fn();
const mockConfirmLateCancelGuestAction = vi.fn();
const mockConfirmLateCancelBothAction = vi.fn();

vi.mock('@/actions/guest', () => ({
  cancelGuestAction: (...args: unknown[]) => mockCancelGuestAction(...args),
  cancelReservationWithGuestAction: (...args: unknown[]) =>
    mockCancelReservationWithGuestAction(...args),
  confirmLateCancelGuestAction: (...args: unknown[]) =>
    mockConfirmLateCancelGuestAction(...args),
  confirmLateCancelBothAction: (...args: unknown[]) =>
    mockConfirmLateCancelBothAction(...args),
}));

describe('CancelGuestDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    enrollmentId: 'enrollment-123',
    guestEnrollmentId: 'guest-enrollment-456',
    guestName: 'María García',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Closed state', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <CancelGuestDialog {...defaultProps} isOpen={false} />
      );
      expect(container.innerHTML).toBe('');
    });
  });

  describe('Open state with two options', () => {
    it('renders the dialog title', () => {
      render(<CancelGuestDialog {...defaultProps} />);
      expect(
        screen.getByText('Cancelar reserva con invitado')
      ).toBeInTheDocument();
    });

    it('displays the guest name in the description', () => {
      render(<CancelGuestDialog {...defaultProps} guestName="Carlos López" />);
      expect(screen.getByText('Carlos López')).toBeInTheDocument();
    });

    it('renders the "Cancelar solo invitado" option', () => {
      render(<CancelGuestDialog {...defaultProps} />);
      expect(
        screen.getByText('Cancelar solo invitado')
      ).toBeInTheDocument();
    });

    it('renders the "Cancelar mi reserva y la del invitado" option', () => {
      render(<CancelGuestDialog {...defaultProps} />);
      expect(
        screen.getByText('Cancelar mi reserva y la del invitado')
      ).toBeInTheDocument();
    });
  });

  describe('Early cancellation flow (>24h)', () => {
    it('calls cancelGuestAction when "Cancelar solo invitado" is clicked', async () => {
      mockCancelGuestAction.mockResolvedValue({ success: true });
      render(<CancelGuestDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Cancelar solo invitado'));
      await waitFor(() => {
        expect(mockCancelGuestAction).toHaveBeenCalledWith('guest-enrollment-456');
      });
    });

    it('calls cancelReservationWithGuestAction when "Cancelar ambas" is clicked', async () => {
      mockCancelReservationWithGuestAction.mockResolvedValue({ success: true });
      render(<CancelGuestDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Cancelar mi reserva y la del invitado'));
      await waitFor(() => {
        expect(mockCancelReservationWithGuestAction).toHaveBeenCalledWith('enrollment-123');
      });
    });
  });

  describe('Late cancellation flow (<24h)', () => {
    it('shows late cancellation warning for guest when action returns LATE_CANCELLATION', async () => {
      mockCancelGuestAction.mockResolvedValue({ success: false, error: 'LATE_CANCELLATION' });
      render(<CancelGuestDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Cancelar solo invitado'));
      await waitFor(() => {
        expect(
          screen.getByText('El crédito de invitado NO será reembolsado. ¿Deseas continuar?')
        ).toBeInTheDocument();
      });
    });

    it('shows "Cancelación tardía de invitado" title in guest late warning', async () => {
      mockCancelGuestAction.mockResolvedValue({ success: false, error: 'LATE_CANCELLATION' });
      render(<CancelGuestDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Cancelar solo invitado'));
      await waitFor(() => {
        expect(screen.getByText('Cancelación tardía de invitado')).toBeInTheDocument();
      });
    });

    it('shows late cancellation warning for both when action returns LATE_CANCELLATION', async () => {
      mockCancelReservationWithGuestAction.mockResolvedValue({ success: false, error: 'LATE_CANCELLATION' });
      render(<CancelGuestDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Cancelar mi reserva y la del invitado'));
      await waitFor(() => {
        expect(
          screen.getByText('El crédito de invitado NO será reembolsado. ¿Deseas continuar?')
        ).toBeInTheDocument();
      });
    });

    it('calls confirmLateCancelGuestAction when confirming late guest cancellation', async () => {
      mockCancelGuestAction.mockResolvedValue({ success: false, error: 'LATE_CANCELLATION' });
      mockConfirmLateCancelGuestAction.mockResolvedValue({ success: true });
      render(<CancelGuestDialog {...defaultProps} />);

      // Trigger late warning
      fireEvent.click(screen.getByText('Cancelar solo invitado'));
      await waitFor(() => {
        expect(screen.getByText('Confirmar cancelación')).toBeInTheDocument();
      });

      // Confirm late cancellation
      fireEvent.click(screen.getByText('Confirmar cancelación'));
      await waitFor(() => {
        expect(mockConfirmLateCancelGuestAction).toHaveBeenCalledWith('guest-enrollment-456');
      });
    });

    it('calls onClose when dismissing late warning for guest', async () => {
      mockCancelGuestAction.mockResolvedValue({ success: false, error: 'LATE_CANCELLATION' });
      const onClose = vi.fn();
      render(<CancelGuestDialog {...defaultProps} onClose={onClose} />);

      // Trigger late warning
      fireEvent.click(screen.getByText('Cancelar solo invitado'));
      await waitFor(() => {
        expect(screen.getByText('Mantener invitado')).toBeInTheDocument();
      });

      // Dismiss
      fireEvent.click(screen.getByText('Mantener invitado'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('displays server error message when action fails', async () => {
      mockCancelGuestAction.mockResolvedValue({ success: false, error: 'No se encontró la reserva.' });
      render(<CancelGuestDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Cancelar solo invitado'));
      await waitFor(() => {
        expect(screen.getByText('No se encontró la reserva.')).toBeInTheDocument();
      });
    });

    it('displays generic error when action throws', async () => {
      mockCancelGuestAction.mockRejectedValue(new Error('Network error'));
      render(<CancelGuestDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Cancelar solo invitado'));
      await waitFor(() => {
        expect(screen.getByText('Error del servidor. Intenta de nuevo.')).toBeInTheDocument();
      });
    });
  });

  describe('Close behavior', () => {
    it('calls onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      render(<CancelGuestDialog {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByText('Cerrar'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
