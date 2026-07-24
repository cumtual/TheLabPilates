import Image from 'next/image'

const benefits = [
  { icon: 'spa', text: 'Reduce el estrés y la ansiedad.' },
  { icon: 'air', text: 'Mejora la respiración y la energía vital.' },
  { icon: 'favorite', text: 'Promueve la conexión mente - cuerpo - espíritu.' },
  { icon: 'self_care', text: 'Mejora la flexibilidad, el equilibrio y la postura.' },
  { icon: 'psychology', text: 'Favorece la concentración y la claridad mental.' },
  { icon: 'light_mode', text: 'Conecta con tu interior y tu bienestar espiritual.' },
]

export default function HathaYoga() {
  return (
    <section
      className="py-section-gap px-[24px] max-w-7xl mx-auto"
      id="hatha-yoga"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
        {/* Text on the left */}
        <div className="order-2 lg:order-1">
          <h2 className="font-headline text-3xl md:text-[48px] mb-8">
            ¿Qué es Hatha Yoga?
          </h2>
          <p className="text-[18px] text-on-surface-variant mb-10 leading-relaxed">
            Hatha Yoga es una práctica tradicional que combina posturas físicas
            (asanas), ejercicios de respiración (pranayama) y meditación para
            equilibrar cuerpo, mente y espíritu. A través de movimientos
            conscientes y pausados, ayuda a fortalecer el cuerpo, calmar la mente
            y conectar contigo mismo en un nivel más profundo.
          </p>

          <div className="mb-10">
            <h3 className="text-[12px] font-semibold text-primary mb-6 uppercase tracking-widest">
              Beneficios
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {benefits.map((benefit) => (
                <li key={benefit.icon} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary">
                    {benefit.icon}
                  </span>
                  <span className="text-[16px] text-on-surface-variant">
                    {benefit.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[12px] font-semibold text-primary tracking-[0.2em] mt-12 border-t border-surface-dim pt-6 uppercase">
            CUERPO. MENTE. RESPIRACIÓN. CONEXIÓN. TODO EN EQUILIBRIO.
          </p>
        </div>

        {/* Image on the right */}
        <div className="order-1 lg:order-2 relative rounded-2xl overflow-hidden shadow-2xl h-[500px]">
          <Image
            src="/images/yoga.png"
            alt="Woman practicing Hatha Yoga in a serene studio environment"
            fill
            quality={90}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  )
}
