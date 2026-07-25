import Image from "next/image"

const benefits = [
  { icon: 'fitness_center', text: 'Todo el material premium para tu práctica.' },
  { icon: 'groups', text: 'Clases en grupos reducidos.' },
  { icon: 'person_celebrate', text: 'Coaches que te acompañan de forma personalizada.' },
  { icon: 'spa', text: 'Aromaterapia' },
  { icon: 'clean_hands', text: 'Equipo sanitizado después de cada sesión.' },
  { icon: 'sentiment_satisfied', text: 'Ambiente cálido y libre de juicios.' },
]

export default function MembershipBenefits() {
  return (
    <section className="py-24 bg-surface-cream border-t border-surface-dim/30">
      <div className="max-w-7xl mx-auto px-[24px]">
        <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-20">
          {/* Text Content */}
          <div className="space-y-8">
            <h2 className="font-headline text-3xl md:text-[48px] leading-tight text-soft-charcoal">
              Lo que incluye tu membresía
            </h2>
            <div className="space-y-6">
              <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-primary">
                Beneficios Exclusivos
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                {benefits.map((benefit) => (
                  <li
                    key={benefit.icon}
                    className="flex items-center gap-3 text-sm text-on-surface-variant"
                  >
                    <span className="material-symbols-outlined text-primary">
                      {benefit.icon}
                    </span>
                    {benefit.text}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[10px] tracking-[0.2em] uppercase font-medium opacity-50 pt-4">
              Diseñado para tu bienestar integral.
            </p>
          </div>

          {/* Image */}
          <div className="order-1 lg:order-2 relative rounded-2xl overflow-hidden shadow-2xl h-[500px]">
                    <Image
                      src="/images/membresia.png"
                      alt="Woman practicing Hatha Yoga in a serene studio environment"
                      fill
                      quality={90}
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover"
                    />
                  </div>
        </div>
      </div>
    </section>
  )
}
