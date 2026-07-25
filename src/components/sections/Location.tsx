import Image from "next/image";

export default function Location() {
  return (
    <section className="py-section-gap px-[24px] max-w-7xl mx-auto" id="ubicacion">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
        {/* Contact Info & Form */}
        <div>
          <p className="text-[12px] font-semibold text-primary mb-4 tracking-widest uppercase">
            PRÓXIMA APERTURA
          </p>
          <h2 className="font-headline text-[40px] md:text-[48px] mb-8 leading-tight">
            Agosto 2026
          </h2>

          <div className="space-y-8 mb-12">
            <div className="flex gap-4">
              <span className="material-symbols-outlined text-primary">
                location_on
              </span>
              <div>
                <h4 className="text-[12px] font-semibold mb-1 uppercase tracking-widest">
                  CENTRO HISTÓRICO
                </h4>
                <p className="text-on-surface-variant">
                  Calle Fray Bartolomé de las Casas,
                  <br />
                  Huajuapan de León, Oaxaca.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="material-symbols-outlined text-primary">mail</span>
              <div>
                <h4 className="text-[12px] font-semibold mb-1 uppercase tracking-widest">
                  CONTACTO
                </h4>
                <p className="text-on-surface-variant">
                  hola@thelabpilates.com
                  <br />
                  +52 953 123 4567
                </p>
              </div>
            </div>
          </div>

          <form className="space-y-6 max-w-md">
            <div>
              <label className="text-[10px] font-semibold text-on-surface-variant mb-2 block tracking-widest uppercase">
                Nombre Completo
              </label>
              <input
                className="w-full bg-transparent border-b border-primary py-3 focus:outline-none focus:border-warm-wood transition-colors"
                placeholder="Tu nombre..."
                type="text"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-on-surface-variant mb-2 block tracking-widest uppercase">
                Email
              </label>
              <input
                className="w-full bg-transparent border-b border-primary py-3 focus:outline-none focus:border-warm-wood transition-colors"
                placeholder="correo@ejemplo.com"
                type="email"
              />
            </div>
            <button
              className="bg-soft-charcoal text-plaster-white px-10 py-4 text-[12px] font-semibold tracking-widest hover:bg-primary transition-colors mt-4 uppercase cursor-pointer"
              type="submit"
            >
              LISTA DE ESPERA
            </button>
          </form>
        </div>

        {/* Studio Image */}
        <div className="relative h-[600px] rounded-2xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Image
            className="w-full h-full object-cover opacity-80"
            src="/images/TheLabPilatesStudio2.png"
            alt="The Lab Pilates Studio entrance featuring minimalist architecture and arched windows"
            fill
            quality={90}
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-warm-wood/10 to-transparent pointer-events-none" />
          <div className="absolute bottom-10 left-10 bg-white/90 backdrop-blur p-6 rounded-lg shadow-xl border border-white/40">
            <p className="font-headline text-2xl mb-1">THE LAB</p>
            <p className="text-[10px] font-semibold tracking-widest opacity-60 uppercase">
              Pilates yoga barre
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
