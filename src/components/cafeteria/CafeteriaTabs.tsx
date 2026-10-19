'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const CAFETERIA_TABS = [
  { label: 'Resumen', href: '/admin/cafeteria' },
  { label: 'Caja', href: '/admin/cafeteria/caja' },
  { label: 'Menú', href: '/admin/cafeteria/menu' },
  { label: 'Ventas', href: '/admin/cafeteria/ventas' },
  { label: 'Cortes', href: '/admin/cafeteria/cortes' },
  { label: 'Cortesías', href: '/admin/cafeteria/cortesias' },
  { label: 'Regalos', href: '/admin/cafeteria/cortesias/regalos' },
] as const;

/** Submenú de «Cafetería» del admin (SPEC-CAFETERIA §8.2), con scroll horizontal en móvil. */
export function CafeteriaTabs() {
  const pathname = usePathname();
  const active = [...CAFETERIA_TABS].sort((a, b) => b.href.length - a.href.length).find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return (
    <nav aria-label="Cafetería" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 py-5">
      {CAFETERIA_TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active?.href === tab.href ? 'page' : undefined}
          className={`shrink-0 min-h-11 inline-flex items-center px-4 rounded-full font-body text-sm whitespace-nowrap ${
            active?.href === tab.href ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant border border-outline-variant/50'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
