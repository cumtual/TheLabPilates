import Image from 'next/image'

const benefits = [
  { icon: 'exercise', text: 'Tonifica y define los músculos.' },
  { icon: 'accessibility_new', text: 'Mejora la postura y la alineación corporal.' },
  { icon: 'fitness_center', text: 'Aumenta la fuerza, el equilibrio y la estabilidad.' },
  { icon: 'self_care', text: 'Mejora la flexibilidad y la movilidad.' },
  { icon: 'spa', text: 'Fortalece el core.' },
  { icon: 'favorite', text: 'Es de bajo impacto, ideal para todos los niveles.' },
]

export default function Barre() {
  return (
    <section
      className="py-section-gap px-[24px] max-w-7xl mx-auto"
      id="barre"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
        {/* Image on the left */}
        <div className="order-1 relative rounded-2xl overflow-hidden shadow-2xl h-[500px]">
          <Image
            src="/images/barre.png"
            alt="Professional Barre studio interior with a woman practicing at a light wood barre"
            fill
            quality={90}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>

        {/* Text on the right */}
        <div className="order-2">
          <h2 className="font-headline text-3xl md:text-[48px] mb-8">
            ¿Qué es Barre?
          </h2>
          <p className="text-[18px] text-on-surface-variant mb-10 leading-relaxed">
            Barre es un método de entrenamiento de bajo impacto que fusiona
            ballet, pilates, yoga y fuerza funcional. Cada movimiento está
            diseñado para fortalecer el cuerpo de forma equilibrada, mejorar la
            postura y desarrollar resistencia, creando una conexión consciente
            entre fuerza, control y movimiento.
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
            FUERZA. CONTROL. EQUILIBRIO. TODO EN CADA MOVIMIENTO.
          </p>
        </div>
      </div>
    </section>
  )
}
