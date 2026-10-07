import { getPublicPackages } from '@/lib/queries/packages'
import { PackageCard } from './PackageCard'
import { getPricingGridClass } from './pricing-grid'

/**
 * Paquetes de la landing, leídos del catálogo (SPEC-SPECIAL-PACKAGES §9, D7): solo los
 * activos y no eliminados. El admin los edita en /admin/packages, que revalida `/`.
 */
export default async function Pricing() {
  const packages = await getPublicPackages()

  return (
    <section className="py-section-gap bg-surface-cream" id="paquetes">
      <div className="max-w-7xl mx-auto px-[24px]">
        {/* Header */}
        <div className="text-center mb-20">
          <p className="text-[12px] font-semibold text-primary mb-4 uppercase tracking-widest">
            Tu Evolución
          </p>
          <h2 className="font-headline text-3xl md:text-[48px] mb-6">
            Membresías
          </h2>
          <p className="text-[16px] text-on-surface-variant max-w-2xl mx-auto">
            Selecciona el camino que mejor se adapte a tus objetivos. Desde
            sesiones individuales hasta nuestra membresía premium de acceso total.
          </p>
        </div>

        {/* Cards Grid */}
        {packages.length > 0 ? (
          <div className={getPricingGridClass(packages.length)}>
            {packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
        ) : (
          <p className="text-center text-[16px] text-on-surface-variant">
            Pronto anunciaremos nuestros paquetes.
          </p>
        )}
      </div>
    </section>
  )
}
