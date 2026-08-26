import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GuestTooltip } from '../coach/GuestTooltip';

describe('GuestTooltip', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('Tooltip text content (Req 5.3, 5.4, 5.5)', () => {
    it('shows "Invitado por: [Name]" for user origin', () => {
      render(
        <GuestTooltip origin="user" registeredByName="María López">
          <span>Invitado Name</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.mouseEnter(trigger);

      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Invitado por: María López'
      );
    });

    it('shows "Invitado por: Admin ([name])" for admin origin with name', () => {
      render(
        <GuestTooltip origin="admin" registeredByName="Admin User">
          <span>Invitado Name</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.mouseEnter(trigger);

      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Invitado por: Admin (Admin User)'
      );
    });

    it('shows "Invitado por: Admin ([email])" for admin origin with email', () => {
      render(
        <GuestTooltip origin="admin" registeredByEmail="admin@studio.com">
          <span>Invitado Name</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.mouseEnter(trigger);

      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Invitado por: Admin (admin@studio.com)'
      );
    });

    it('prefers name over email for admin origin', () => {
      render(
        <GuestTooltip
          origin="admin"
          registeredByName="Admin Name"
          registeredByEmail="admin@studio.com"
        >
          <span>Invitado Name</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.mouseEnter(trigger);

      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Invitado por: Admin (Admin Name)'
      );
    });

    it('shows "Invitado por: Información no disponible" when user origin has no name (Req 5.5)', () => {
      render(
        <GuestTooltip origin="user">
          <span>Invitado Name</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.mouseEnter(trigger);

      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Invitado por: Información no disponible'
      );
    });

    it('shows "Invitado por: Información no disponible" when admin origin has no name or email (Req 5.5)', () => {
      render(
        <GuestTooltip origin="admin">
          <span>Invitado Name</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.mouseEnter(trigger);

      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Invitado por: Información no disponible'
      );
    });
  });

  describe('Desktop: tooltip on hover (Req 5.3)', () => {
    it('shows tooltip on mouseEnter', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Juan Pérez">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

      fireEvent.mouseEnter(trigger);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('hides tooltip on mouseLeave', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Juan Pérez">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.mouseEnter(trigger);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.mouseLeave(trigger);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('renders children content', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test User">
          <span data-testid="child-content">Guest Badge</span>
        </GuestTooltip>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
  });

  describe('Mobile: modal on tap (Req 5.4)', () => {
    it('opens modal on click', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Ana García">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.click(trigger);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows inviter text in modal', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Ana García">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.click(trigger);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Invitado por: Ana García');
    });

    it('shows modal title "Información del invitado"', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      fireEvent.click(screen.getByRole('button'));

      expect(
        screen.getByText('Información del invitado')
      ).toBeInTheDocument();
    });

    it('closes modal when clicking "Cerrar" button', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cerrar'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes modal when clicking backdrop', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      fireEvent.click(screen.getByRole('button'));
      const dialog = screen.getByRole('dialog');

      // Click on the backdrop (the outer div)
      fireEvent.click(dialog);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes modal on Escape key', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('locks body scroll when modal is open', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when modal closes', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(document.body.style.overflow).toBe('hidden');

      fireEvent.click(screen.getByText('Cerrar'));
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Accessibility', () => {
    it('has role="button" on the trigger container', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test User">
          <span>Guest</span>
        </GuestTooltip>
      );

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('has tabIndex=0 for keyboard access', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test User">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      expect(trigger).toHaveAttribute('tabindex', '0');
    });

    it('has aria-label with inviter text', () => {
      render(
        <GuestTooltip origin="user" registeredByName="María López">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      expect(trigger).toHaveAttribute(
        'aria-label',
        'Invitado por: María López'
      );
    });

    it('sets aria-describedby when tooltip is visible', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      expect(trigger).not.toHaveAttribute('aria-describedby');

      fireEvent.mouseEnter(trigger);
      expect(trigger).toHaveAttribute('aria-describedby');
    });

    it('opens modal via Enter key', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.keyDown(trigger, { key: 'Enter' });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('opens modal via Space key', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      fireEvent.keyDown(trigger, { key: ' ' });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('modal has aria-modal="true"', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('modal has aria-labelledby pointing to title', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      fireEvent.click(screen.getByRole('button'));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute(
        'aria-labelledby',
        'guest-tooltip-modal-title'
      );
    });

    it('trigger has minimum touch target size (min-h-11 min-w-11)', () => {
      render(
        <GuestTooltip origin="user" registeredByName="Test">
          <span>Guest</span>
        </GuestTooltip>
      );

      const trigger = screen.getByRole('button');
      expect(trigger.className).toContain('min-h-11');
      expect(trigger.className).toContain('min-w-11');
    });
  });
});
