import WaitlistForm from '@/components/sections/WaitlistForm'

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
                  info@thelabpilatesstudio.com.mx
                  <br />
                  <a href="https://www.instagram.com/thelabpilates.hpjn/" target="_blank">@thelabpilates.hpjn</a>
                </p>
              </div>
            </div>
          </div>

          <WaitlistForm />
        </div>

        {/* Google Maps */}
        <div className="relative h-[600px] rounded-2xl overflow-hidden">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d650.3118584733268!2d-97.77854102423386!3d17.805002892544284!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x85c601fbc3f37335%3A0xa625ed5256bca402!2sCalle%20Prol.%20de%20Micaela%20Galindo%2024%2C%20Centro%2C%2069000%20Heroica%20Cdad.%20de%20Huajuapan%20de%20Le%C3%B3n%2C%20Oax.!5e0!3m2!1ses!2smx!4v1785045922930!5m2!1ses!2smx"
            className="w-full h-full rounded-2xl"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            title="Ubicación de The Lab Pilates Studio en Google Maps"
          />
        </div>
      </div>
    </section>
  )
}
