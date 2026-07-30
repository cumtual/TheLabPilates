import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortalNav from '../PortalNav';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/client'),
}));

// Mock next/link to render a simple anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock the logoutAction
vi.mock('@/actions/auth', () => ({
  logoutAction: vi.fn(),
}));

describe('PortalNav', () => {
  describe('mobile hamburger button', () => {
    it('renders hamburger button with correct aria-label', () => {
      render(<PortalNav role="client" userName="Test User" />);
      expect(screen.getByLabelText('Abrir menú de navegación')).toBeInTheDocument();
    });

    it('hamburger button is styled for mobile only (has md:hidden class)', () => {
      render(<PortalNav role="client" userName="Test User" />);
      const hamburger = screen.getByLabelText('Abrir menú de navegación');
      expect(hamburger.className).toContain('md:hidden');
    });
  });

  describe('desktop sidebar', () => {
    it('renders desktop sidebar with hidden md:flex classes for ≥768px visibility', () => {
      render(<PortalNav role="client" userName="Test User" />);
      const sidebars = screen.getAllByLabelText('Navegación del portal');
      // The desktop sidebar has "hidden md:flex" classes
      const desktopSidebar = sidebars.find(el => el.className.includes('hidden md:flex'));
      expect(desktopSidebar).toBeDefined();
    });
  });

  describe('role-specific menu items', () => {
    it('renders client menu items: Dashboard, Clases, Suscripción, Reservaciones', () => {
      render(<PortalNav role="client" userName="Test User" />);
      // Items appear in both mobile drawer and desktop sidebar
      expect(screen.getAllByText('Dashboard')).toHaveLength(2);
      expect(screen.getAllByText('Clases')).toHaveLength(2);
      expect(screen.getAllByText('Suscripción')).toHaveLength(2);
      expect(screen.getAllByText('Reservaciones')).toHaveLength(2);
    });

    it('does not render coach or admin items for client role', () => {
      render(<PortalNav role="client" userName="Test User" />);
      expect(screen.queryByText('Nueva Clase')).not.toBeInTheDocument();
      expect(screen.queryByText('Pagos')).not.toBeInTheDocument();
      expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
    });

    it('renders coach menu items: Dashboard, Clases, Nueva Clase', () => {
      render(<PortalNav role="coach" userName="Coach User" />);
      expect(screen.getAllByText('Dashboard')).toHaveLength(2);
      expect(screen.getAllByText('Clases')).toHaveLength(2);
      expect(screen.getAllByText('Nueva Clase')).toHaveLength(2);
    });

    it('does not render client-only or admin items for coach role', () => {
      render(<PortalNav role="coach" userName="Coach User" />);
      expect(screen.queryByText('Suscripción')).not.toBeInTheDocument();
      expect(screen.queryByText('Reservaciones')).not.toBeInTheDocument();
      expect(screen.queryByText('Pagos')).not.toBeInTheDocument();
      expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
    });

    it('renders admin menu items: Dashboard, Pagos, Clases, Usuarios, Suscripciones', () => {
      render(<PortalNav role="admin" userName="Admin User" />);
      expect(screen.getAllByText('Dashboard')).toHaveLength(2);
      expect(screen.getAllByText('Pagos')).toHaveLength(2);
      expect(screen.getAllByText('Clases')).toHaveLength(2);
      expect(screen.getAllByText('Usuarios')).toHaveLength(2);
      expect(screen.getAllByText('Suscripciones')).toHaveLength(2);
    });

    it('does not render client-only or coach-only items for admin role', () => {
      render(<PortalNav role="admin" userName="Admin User" />);
      expect(screen.queryByText('Suscripción')).not.toBeInTheDocument();
      expect(screen.queryByText('Reservaciones')).not.toBeInTheDocument();
      expect(screen.queryByText('Nueva Clase')).not.toBeInTheDocument();
    });
  });

  describe('user info and logout', () => {
    it('renders user name', () => {
      render(<PortalNav role="client" userName="María García" />);
      // User name appears in both mobile drawer and desktop sidebar
      expect(screen.getAllByText('María García')).toHaveLength(2);
    });

    it('renders logout button', () => {
      render(<PortalNav role="client" userName="Test User" />);
      expect(screen.getAllByText('Cerrar sesión')).toHaveLength(2);
    });
  });
});
