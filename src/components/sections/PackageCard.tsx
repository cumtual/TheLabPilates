import Link from 'next/link'
import type { ReactNode } from 'react'
import type { PackageCardView } from '@/lib/subscription/package-view'

interface PackageCardProps {
  pkg: PackageCardView
  /** Reemplaza el botón «ELEGIR» (por ejemplo, la compra en la tienda). */
  action?: ReactNode
}

/**
 * Tarjeta de paquete con el diseño original de la landing (SPEC-SPECIAL-PACKAGES §9).
 * Mismas clases que antes; solo se agregan protecciones contra desbordes
 * (`line-clamp-2`, `truncate`) para textos capturados desde el admin.
 */
export function PackageCard({ pkg, action }: PackageCardProps) {
  const premium = pkg.isFeatured

  return (
    <div
      className={
        premium
          ? 'bg-warm-wood p-8 rounded-xl flex flex-col justify-between shadow-2xl scale-105 z-10 my-4'
          : 'bg-surface p-8 rounded-xl flex flex-col justify-between hover:shadow-xl hover:-translate-y-1 transition-all duration-500'
      }
    >
      <div>
        {premium ? (
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-headline text-2xl text-plaster-white">
              {pkg.displayName}
            </h3>
            <span className="bg-plaster-white/20 px-3 py-1 rounded-full text-[10px] text-plaster-white font-semibold tracking-widest uppercase">
              PREMIUM
            </span>
          </div>
        ) : (
          <h3 className="font-headline text-2xl mb-2">{pkg.displayName}</h3>
        )}

        {pkg.guestBadge && (
          <span
            className={`inline-block mb-3 px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase ${
              premium ? 'bg-plaster-white/20 text-plaster-white' : 'bg-primary/15 text-primary'
            }`}
          >
            {pkg.guestBadge}
          </span>
        )}

        <p
          className={`text-sm italic mb-4 leading-relaxed ${
            premium ? 'text-plaster-white/90 mb-8' : 'text-on-surface-variant/80'
          } line-clamp-2`}
        >
          {pkg.shortDescription}
        </p>

        {premium ? (
          <div className="mb-8">
            <p className="text-[11px] font-semibold text-plaster-white/70 tracking-widest mb-2 uppercase line-clamp-2">
              {pkg.sessionsLabel}
            </p>
            <p className="font-headline text-[40px] text-plaster-white">
              <span className="font-body">$</span>
              {pkg.priceLabel}
            </p>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-primary tracking-widest mb-6 line-clamp-2">
              {pkg.sessionsLabel}
            </p>
            <p className="font-headline text-[40px] mb-8">
              <span className="font-body">$</span>
              {pkg.priceLabel}
            </p>
          </>
        )}

        {pkg.features.length > 0 && (
          <ul
            className={`space-y-4 mb-10 text-sm ${
              premium
                ? 'text-plaster-white/90 space-y-5 mb-12'
                : 'text-on-surface-variant'
            }`}
          >
            {pkg.features.slice(0, 4).map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">
                  {premium ? 'all_inclusive' : 'check'}
                </span>
                <span className="truncate min-w-0" title={feature}>{feature}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {action ?? (
        <Link
          href="login"
          className={
            premium
              ? 'w-full py-5 bg-plaster-white text-warm-wood text-[12px] font-semibold tracking-widest hover:bg-soft-charcoal hover:text-white transition-all shadow-lg uppercase cursor-pointer text-center block'
              : 'w-full py-4 border border-outline text-soft-charcoal text-[12px] font-semibold tracking-widest hover:bg-soft-charcoal hover:text-white transition-all uppercase cursor-pointer text-center block'
          }
        >
          {pkg.ctaLabel}
        </Link>
      )}
    </div>
  )
}
