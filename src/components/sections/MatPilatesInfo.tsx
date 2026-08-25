import Image from 'next/image'

const benefits = [
  { icon: 'exercise', text: 'Fortalece el core (abdomen, espalda y pelvis).' },
  { icon: 'accessibility_new', text: 'Mejora la postura y el equilibrio.' },
  { icon: 'fitness_center', text: 'Aumenta la fuerza y la flexibilidad.' },
  { icon: 'self_care', text: 'Favorece la movilidad articular.' },
  { icon: 'spa', text: 'Ayuda a reducir el estrés.' },
  { icon: 'psychology', text: 'Mejora el control corporal.' },
]

export default function MatPilatesInfo() {
  return (
    <section
      className="py-section-gap px-[24px] max-w-7xl mx-auto"
      id="mat-pilates"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
        {/* Text Content */}
        <div className="order-2 lg:order-1">
          <h2 className="font-headline text-3xl md:text-[48px] mb-8">
            ¿Qué es Mat Pilates?
          </h2>
          <p className="text-[18px] text-on-surface-variant mb-10 leading-relaxed">
            El Mat Pilates es un método de entrenamiento que se realiza sobre un
            tapete (mat), utilizando principalmente el peso del propio cuerpo como
            resistencia. A través de movimientos controlados y una respiración
            consciente, fortalece el cuerpo de manera equilibrada sin necesidad de
            máquinas.
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
            UN CUERPO FUERTE, UNA MENTE EN PAZ.
          </p>
        </div>

        {/* Image */}
        <div className="order-1 lg:order-2 relative rounded-2xl overflow-hidden shadow-2xl h-[500px]">
          <Image
            src="/images/the_lab_secition.png"
            alt="Minimalist Bala pilates equipment including weights and rings on a light-toned floor with soft natural lighting"
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
