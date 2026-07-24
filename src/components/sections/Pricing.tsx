import Link from 'next/link'

const packages = [
  {
    name: 'Lab Pass',
    tagline: 'Todo comienza con un primer paso.',
    sessions: 'SINGLE SESSION',
    price: '$120',
    features: ['Mat Pilates', 'Barre', 'Yoga'],
    premium: false,
  },
  {
    name: 'Lab Entry',
    tagline: 'Empieza a descubrir de lo que eres capaz.',
    sessions: '4 SESIONES',
    price: '$460',
    features: ['Flexibilidad de horario'],
    premium: false,
  },
  {
    name: 'Lab Practice',
    tagline: 'La constancia construye resultados.',
    sessions: '8 SESIONES',
    price: '$880',
    features: ['Flexibilidad de horario'],
    premium: false,
  },
  {
    name: 'Lab Progress',
    tagline: 'Cada movimiento te acerca a tu mejor versión.',
    sessions: '12 SESIONES',
    price: '$1,260',
    features: ['Flexibilidad de horario'],
    premium: false,
  },
  {
    name: '∞ Open Lab',
    tagline: 'Haz del movimiento parte de tu vida.',
    sessions: 'UNLIMITED ACCESS',
    price: '$2,850',
    features: [
      'Clases Mixtas (All)',
      'Locker personal',
      'Flexibilidad total',
    ],
    premium: true,
  },
]

export default function Pricing() {
  return (
    <section className="py-section-gap bg-surface-cream" id="paquetes">
      <div className="max-w-7xl mx-auto px-[24px]">
        {/* Header */}
        <div className="text-center mb-20">
          <p className="text-[12px] font-semibold text-primary mb-4 uppercase tracking-widest">
            Tu Evolución
          </p>
          <h2 className="font-headline text-3xl md:text-[48px] mb-6">
            Planes y Precios
          </h2>
          <p className="text-[16px] text-on-surface-variant max-w-2xl mx-auto">
            Selecciona el camino que mejor se adapte a tus objetivos. Desde
            sesiones individuales hasta nuestra membresía premium de acceso total.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {packages.map((pkg) => (
            <div
              key={pkg.name}
              className={
                pkg.premium
                  ? 'bg-warm-wood p-8 rounded-xl flex flex-col justify-between shadow-2xl scale-105 z-10 my-4'
                  : 'bg-surface p-8 rounded-xl flex flex-col justify-between hover:shadow-xl hover:-translate-y-1 transition-all duration-500'
              }
            >
              <div>
                {pkg.premium ? (
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-headline text-2xl text-plaster-white">
                      {pkg.name}
                    </h3>
                    <span className="bg-plaster-white/20 px-3 py-1 rounded-full text-[10px] text-plaster-white font-semibold tracking-widest uppercase">
                      PREMIUM
                    </span>
                  </div>
                ) : (
                  <h3 className="font-headline text-2xl mb-2">{pkg.name}</h3>
                )}

                <p
                  className={`text-sm italic mb-4 leading-relaxed ${
                    pkg.premium ? 'text-plaster-white/90 mb-8' : 'text-on-surface-variant/80'
                  }`}
                >
                  {pkg.tagline}
                </p>

                {pkg.premium ? (
                  <div className="mb-8">
                    <p className="text-[11px] font-semibold text-plaster-white/70 tracking-widest mb-2 uppercase">
                      {pkg.sessions}
                    </p>
                    <p className="font-headline text-[40px] text-plaster-white">
                      {pkg.price}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] font-semibold text-primary tracking-widest mb-6">
                      {pkg.sessions}
                    </p>
                    <p className="font-headline text-[40px] mb-8">{pkg.price}</p>
                  </>
                )}

                {pkg.features.length > 0 && (
                  <ul
                    className={`space-y-4 mb-10 text-sm ${
                      pkg.premium
                        ? 'text-plaster-white/90 space-y-5 mb-12'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    {pkg.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">
                          {pkg.premium ? 'all_inclusive' : 'check'}
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Link
                href="/soon"
                className={
                  pkg.premium
                    ? 'w-full py-5 bg-plaster-white text-warm-wood text-[12px] font-semibold tracking-widest hover:bg-soft-charcoal hover:text-white transition-all shadow-lg uppercase cursor-pointer text-center block'
                    : 'w-full py-4 border border-outline text-soft-charcoal text-[12px] font-semibold tracking-widest hover:bg-soft-charcoal hover:text-white transition-all uppercase cursor-pointer text-center block'
                }
              >
                {pkg.premium ? 'RESERVAR TODO' : 'ELEGIR'}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
