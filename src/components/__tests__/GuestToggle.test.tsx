import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GuestToggle } from '../client/GuestToggle';
import type { GuestEligibilityResult } from '@/lib/types/guest';

describe('GuestToggle', () => {
  const defaultProps = {
    eligibility: null as GuestEligibilityResult | null,
    isLoading: false,
    onToggle: vi.fn(),
    checked: false,
  };

  describe('Hidden state (no Open Lab membership)', () => {
    it('renders nothing when eligibility is null and not loading', () => {
      const { container } = render(
        <GuestToggle {...defaultProps} eligibility={null} isLoading={false} />
      );
      expect(container.innerHTML).toBe('');
    });
  });

  describe('Loading state', () => {
    it('renders loading skeleton when isLoading is true', () => {
      const { container } = render(
        <GuestToggle {...defaultProps} isLoading={true} />
      );
      const pulseElements = container.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('does not render toggle switch when loading', () => {
      render(<GuestToggle {...defaultProps} isLoading={true} />);
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });

  describe('Enabled state (eligible with credits)', () => {
    const eligibleResult: GuestEligibilityResult = {
      eligible: true,
      creditsAvailable: 1,
    };

    it('renders an enabled toggle switch', () => {
      render(
        <GuestToggle {...defaultProps} eligibility={eligibleResult} />
      );
      const toggle = screen.getByRole('switch');
      expect(toggle).not.toBeDisabled();
    });

    it('displays the label text', () => {
      render(
        <GuestToggle {...defaultProps} eligibility={eligibleResult} />
      );
      expect(
        screen.getByText('¿Deseas agregar un invitado?')
      ).toBeInTheDocument();
    });

    it('calls onToggle when clicked', () => {
      const onToggle = vi.fn();
      render(
        <GuestToggle
          {...defaultProps}
          eligibility={eligibleResult}
          onToggle={onToggle}
        />
      );
      fireEvent.click(screen.getByRole('switch'));
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('reflects checked state', () => {
      render(
        <GuestToggle
          {...defaultProps}
          eligibility={eligibleResult}
          checked={true}
        />
      );
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeChecked();
    });

    it('does not show the disabled tooltip', () => {
      render(
        <GuestToggle {...defaultProps} eligibility={eligibleResult} />
      );
      expect(
        screen.queryByText('Ya utilizaste tu invitado en el ciclo mensual actual')
      ).toBeNull();
    });
  });

  describe('Disabled state (credits exhausted)', () => {
    const noCreditsResult: GuestEligibilityResult = {
      eligible: true,
      creditsAvailable: 0,
    };

    it('renders a disabled toggle switch', () => {
      render(
        <GuestToggle {...defaultProps} eligibility={noCreditsResult} />
      );
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeDisabled();
    });

    it('shows the tooltip message about exhausted credits', () => {
      render(
        <GuestToggle {...defaultProps} eligibility={noCreditsResult} />
      );
      expect(
        screen.getByText('Ya utilizaste tu invitado en el ciclo mensual actual')
      ).toBeInTheDocument();
    });

    it('does not call onToggle when clicked', () => {
      const onToggle = vi.fn();
      render(
        <GuestToggle
          {...defaultProps}
          eligibility={noCreditsResult}
          onToggle={onToggle}
        />
      );
      fireEvent.click(screen.getByRole('switch'));
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  describe('Error state (verification failed)', () => {
    const errorResult: GuestEligibilityResult = {
      eligible: false,
      creditsAvailable: 0,
      reason: 'Error de conexión al servidor',
    };

    it('renders an error message', () => {
      render(
        <GuestToggle {...defaultProps} eligibility={errorResult} />
      );
      expect(
        screen.getByText('No se pudo verificar la elegibilidad para invitados.')
      ).toBeInTheDocument();
    });

    it('renders a retry button when onRetry is provided', () => {
      const onRetry = vi.fn();
      render(
        <GuestToggle
          {...defaultProps}
          eligibility={errorResult}
          onRetry={onRetry}
        />
      );
      const retryButton = screen.getByText('Reintentar');
      expect(retryButton).toBeInTheDocument();
    });

    it('calls onRetry when retry button is clicked', () => {
      const onRetry = vi.fn();
      render(
        <GuestToggle
          {...defaultProps}
          eligibility={errorResult}
          onRetry={onRetry}
        />
      );
      fireEvent.click(screen.getByText('Reintentar'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('does not render retry button when onRetry is not provided', () => {
      render(
        <GuestToggle {...defaultProps} eligibility={errorResult} />
      );
      expect(screen.queryByText('Reintentar')).toBeNull();
    });

    it('does not render toggle switch in error state', () => {
      render(
        <GuestToggle {...defaultProps} eligibility={errorResult} />
      );
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });

  describe('Responsive layout', () => {
    it('has responsive flex classes for vertical mobile and horizontal desktop', () => {
      const eligibleResult: GuestEligibilityResult = {
        eligible: true,
        creditsAvailable: 1,
      };
      const { container } = render(
        <GuestToggle {...defaultProps} eligibility={eligibleResult} />
      );
      const wrapper = container.firstElementChild;
      expect(wrapper?.className).toContain('flex-col');
      expect(wrapper?.className).toContain('md:flex-row');
    });
  });
});
