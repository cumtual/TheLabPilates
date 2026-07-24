export default function Philosophy() {
  return (
    <section
      className="py-section-gap px-[24px] max-w-7xl mx-auto"
      id="filosofia"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-[32px] items-center">
        <div className="md:col-span-5">
          <p className="text-[12px] font-semibold text-primary mb-6 tracking-widest uppercase">
            SOBRE EL LABORATORIO
          </p>
          <h2 className="font-headline text-3xl md:text-[54px] leading-tight mb-8">
            La ciencia del movimiento, el arte del bienestar.
          </h2>
        </div>
        <div className="md:col-span-6 md:col-start-7">
          <div className="mb-6">
            <h3 className="font-headline text-2xl text-primary mb-2">
              ¿Por qué The Lab?
            </h3>
            <p className="text-[18px] text-on-surface-variant leading-relaxed">
              Creamos este espacio con el propósito de que cada sesión sea una
              oportunidad para fortalecer tu cuerpo, despejar tu mente y
              reconectar contigo.
            </p>
          </div>
          <p className="text-[18px] text-on-surface-variant leading-relaxed mb-6">
            Aquí cada movimiento se aprende, se comprende y se practica, sin
            comparación, sin presión.
          </p>
          <p className="text-[16px] text-on-surface-variant/80 italic">
            Un espacio donde cada persona se sienta cómoda y bienvenida.
          </p>
        </div>
      </div>
    </section>
  )
}
