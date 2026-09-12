export default function Footer() {
  return (
    <footer className="bg-surface-cream border-t border-surface-dim">
      <div className="max-w-7xl mx-auto py-20 px-[24px] flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-right">
        <div className="flex flex-col items-center md:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="The Lab Pilates Logo"
            className="h-10 mb-6 opacity-80 object-contain"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDn7LbowSjjomK87SmSrlVE8BfycKRTegAhIw5FRc4P-SNl18OXT1JpSnwSCfJvIy6XuNlnPPLza_nCirv-z0cX_zCOs6af2QO6tCwVhO3PpAoUCkBFD2qcXEmwhObFZzdiyS5cn4KyH68Sql4maUSatJtnAhdWzm7uIIfbhvKEYIyzNxHRV0v5CazVIyy72PCxfk5p85MSI6njZBcstAdRGBxXnsVi6dLIIUPFcbj6giOwl7Gbfbm81cA7XFLFR9aY-mij0FeXtas"
          />
          <p className="text-[16px] text-on-surface-variant max-w-xs md:text-left">
            Un espacio donde cada persona se sienta cómoda y bienvenida.
          </p>
        </div>

        <div className="flex flex-col gap-6 items-center md:items-end">
          <div className="flex flex-wrap justify-center md:justify-end gap-10">
            <a
              className="text-[12px] font-semibold tracking-widest text-on-surface-variant hover:text-primary transition-colors uppercase"
              href="https://www.instagram.com/thelabpilates.hpjn/" target="_blank"
            >
              Instagram
            </a>
            <a
              className="text-[12px] font-semibold tracking-widest text-on-surface-variant hover:text-primary transition-colors uppercase"
              href="/aviso-de-privacidad"
            >
              Privacidad
            </a>
            <a
              className="text-[12px] font-semibold tracking-widest text-on-surface-variant hover:text-primary transition-colors uppercase"
              href="/terminos-y-condiciones"
            >
              Términos
            </a>
          </div>
          <div className="md:text-right mt-4">
            <p className="text-[12px] font-semibold text-secondary">
              © 2026 The Lab Pilates Studio. Huajuapan de León, Oaxaca.
            </p>
            <p className="text-[10px] font-semibold tracking-tighter opacity-40 uppercase mt-2">
              Diseñado para la calma
            </p>
          </div>
        </div>
      </div>

      <div className="text-center pb-6">
        <p className="text-[11px] text-on-surface-variant/50">
          with love <a href="https://cumtual.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline">Cumtual</a> ❤️
        </p>
      </div>
    </footer>
  )
}
