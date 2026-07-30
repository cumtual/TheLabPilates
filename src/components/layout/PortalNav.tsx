'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/lib/types';
import { logoutAction } from '@/actions/auth';
import Image from 'next/image';

interface PortalNavProps {
  role: UserRole;
  userName: string;
}

interface MenuItem {
  label: string;
  href: string;
  icon: string;
}

const menuItems: Record<UserRole, MenuItem[]> = {
  client: [
    { label: 'Dashboard', href: '/client', icon: 'dashboard' },
    { label: 'Clases', href: '/client/classes', icon: 'fitness_center' },
    { label: 'Suscripción', href: '/client/subscription', icon: 'card_membership' },
    { label: 'Reservaciones', href: '/client/reservations', icon: 'calendar_today' },
  ],
  coach: [
    { label: 'Dashboard', href: '/coach', icon: 'dashboard' },
    { label: 'Clases', href: '/coach/classes', icon: 'fitness_center' },
    { label: 'Nueva Clase', href: '/coach/classes/new', icon: 'add_circle' },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: 'dashboard' },
    { label: 'Pagos', href: '/admin/payments', icon: 'payments' },
    { label: 'Clases', href: '/admin/classes', icon: 'fitness_center' },
    { label: 'Usuarios', href: '/admin/users', icon: 'group' },
    { label: 'Suscripciones', href: '/admin/subscriptions', icon: 'card_membership' },
    { label: 'Tarjetas', href: '/admin/debit-cards', icon: 'credit_card' },
  ],
};

export default function PortalNav({ role, userName }: PortalNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const items = menuItems[role];

  function isActive(href: string): boolean {
    if (href === `/${role}`) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile hamburger button — visible below md (768px) */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Abrir menú de navegación"
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center min-w-11 min-h-11 w-11 h-11 rounded-md bg-surface-container-low text-on-surface shadow-sm"
      >
        <span className="material-symbols-outlined text-2xl">menu</span>
      </button>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile slide-out drawer */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-surface shadow-lg transform transition-transform duration-300 md:hidden flex flex-col ${drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        aria-label="Navegación del portal"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between p-4 border-b border-outline-variant">
          {/* <span className="font-headline text-headline-lg-mobile text-primary">
            The Lab
          </span> */}
          <div className="flex items-center gap-4">
            <Image
            alt="The Lab Pilates Logo"
            className="h-8 md:h-10 w-auto object-contain"
            src="/images/TheLabLogo.png"
            width={180}
            height={60}
          />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
            className="flex items-center justify-center min-w-11 min-h-11 w-11 h-11 rounded-md text-on-surface-variant hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 px-4 min-h-11 rounded-md font-body text-body-md transition-colors ${isActive(item.href)
                      ? 'bg-primary-container text-primary font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container-low'
                    }`}
                >
                  <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User info + Logout */}
        <div className="border-t border-outline-variant p-4">
          <p className="font-body text-body-md text-on-surface truncate mb-2">{userName}</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-3 w-full px-4 min-h-11 rounded-md font-body text-body-md text-error hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-xl">logout</span>
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Desktop sidebar — visible at ≥768px */}
      <aside
        className="hidden md:flex fixed top-0 left-0 h-full w-64 bg-surface border-r border-outline-variant flex-col z-30"
        aria-label="Navegación del portal"
      >
        {/* Sidebar header */}
        <div className="flex items-center p-6 border-b border-outline-variant">
          {/* <span className="font-headline text-headline-lg-mobile text-primary">
            The Lab
          </span> */}
          <div className="flex items-center">
            <Image
            alt="The Lab Pilates Logo"
            className="h-8 md:h-10 w-auto object-contain"
            src="/images/TheLabLogo.png"
            width={180}
            height={60}
          />
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 min-h-11 rounded-md font-body text-body-md transition-colors ${isActive(item.href)
                      ? 'bg-primary-container text-primary font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container-low'
                    }`}
                >
                  <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User info + Logout */}
        <div className="border-t border-outline-variant p-4">
          <p className="font-body text-body-md text-on-surface truncate mb-2">{userName}</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-3 w-full px-4 min-h-11 rounded-md font-body text-body-md text-error hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-xl">logout</span>
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
