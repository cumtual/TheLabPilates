import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GuestBadge } from '../coach/GuestBadge';

describe('GuestBadge', () => {
  describe('Rendering', () => {
    it('renders "[Invitado]" text', () => {
      render(<GuestBadge guestName="María López" origin="user" />);
      expect(screen.getByText('[Invitado]')).toBeInTheDocument();
    });

    it('renders with role="status"', () => {
      render(<GuestBadge guestName="María López" origin="user" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Color differentiation by origin (Req 5.2)', () => {
    it('applies primary color styles for user origin', () => {
      render(<GuestBadge guestName="Juan Pérez" origin="user" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-primary/15');
      expect(badge.className).toContain('text-primary');
      expect(badge.className).toContain('border-primary/30');
    });

    it('applies warm-wood color styles for admin origin', () => {
      render(<GuestBadge guestName="Ana García" origin="admin" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-warm-wood/15');
      expect(badge.className).toContain('text-secondary');
      expect(badge.className).toContain('border-warm-wood/30');
    });
  });

  describe('Accessibility (Req 5.2, 8.3)', () => {
    it('has aria-label indicating guest registered by user', () => {
      render(<GuestBadge guestName="Carlos Ruiz" origin="user" />);
      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute(
        'aria-label',
        'Carlos Ruiz es invitado registrado por usuario titular'
      );
    });

    it('has aria-label indicating guest registered by admin', () => {
      render(<GuestBadge guestName="Laura Díaz" origin="admin" />);
      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute(
        'aria-label',
        'Laura Díaz es invitado registrado por administrador'
      );
    });
  });

  describe('Touch target & text size (Req 8.3)', () => {
    it('has minimum 44x44px interactive area', () => {
      render(<GuestBadge guestName="Pedro Sánchez" origin="user" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('min-h-[44px]');
      expect(badge.className).toContain('min-w-[44px]');
    });

    it('has text size of at least 14px', () => {
      render(<GuestBadge guestName="Pedro Sánchez" origin="user" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('text-[14px]');
    });
  });

  describe('Styling', () => {
    it('merges custom className', () => {
      render(<GuestBadge guestName="Test" origin="user" className="ml-2" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('ml-2');
    });

    it('applies rounded-full border style', () => {
      render(<GuestBadge guestName="Test" origin="user" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('rounded-full');
      expect(badge.className).toContain('border');
    });

    it('applies font-semibold weight', () => {
      render(<GuestBadge guestName="Test" origin="user" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('font-semibold');
    });
  });
});
