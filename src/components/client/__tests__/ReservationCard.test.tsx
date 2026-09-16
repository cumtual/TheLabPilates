import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReservationCard } from '../ReservationCard';

vi.mock('@/actions/enrollment', () => ({
  cancelReservationAction: vi.fn(),
  confirmLateCancellationAction: vi.fn(),
}));

vi.mock('@/actions/guest', () => ({
  addGuestToReservationAction: vi.fn(),
  cancelGuestAction: vi.fn(),
  cancelReservationWithGuestAction: vi.fn(),
  confirmLateCancelGuestAction: vi.fn(),
  confirmLateCancelBothAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { cancelReservationAction } from '@/actions/enrollment';

const reservation = {
  id: 'enrollment-1',
  classDate: new Date('2099-12-25T10:00:00-06:00'),
  classType: 'mat_pilates',
  customName: null,
  coachName: 'Coach Ana',
};

describe('ReservationCard — confirmación de cancelación', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a confirmation modal with the class details before cancelling', () => {
    render(<ReservationCard reservation={reservation} />);

    // No action called before confirming
    expect(cancelReservationAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));

    // Confirmation question + class details
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/estás segur@ de cancelar tu lugar en la clase/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Mat Pilates')).toBeInTheDocument();
    expect(within(dialog).getByText(/coach: coach ana/i)).toBeInTheDocument();

    // Still no mutation until the user confirms
    expect(cancelReservationAction).not.toHaveBeenCalled();
  });

  it('only cancels after pressing the confirm button', () => {
    (cancelReservationAction as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      message: 'ok',
    });

    render(<ReservationCard reservation={reservation} />);

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar mi lugar/i }));

    expect(cancelReservationAction).toHaveBeenCalledWith('enrollment-1');
  });

  it('does not cancel when the user closes the modal', () => {
    render(<ReservationCard reservation={reservation} />);

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^volver$/i }));

    expect(cancelReservationAction).not.toHaveBeenCalled();
  });
});
