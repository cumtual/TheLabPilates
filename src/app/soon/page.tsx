import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Próximamente | The Lab Pilates',
  description:
    'Nuestro sistema de reservas está en una fase de refinamiento. Pronto podrás reservar tus clases.',
}

export default function SoonPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Grain Texture */}
      <div className="grain" />

      {/* Top Nav */}
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-[24px] py-6 max-w-7xl mx-auto bg-transparent backdrop-blur-md">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAst79cvRgGmmQg_2cLK4fDlgcija7TYEdNUdvxdz81bi0jh-4ksPxJos5pZ-fnE5zSrSU0iTw979fL67MnMk-Gjg5Jh45IYZL7RUzIFQfERHYJ2JDBx4zEVDWghuASofwW3ng_ZhAw6YWwrhv3Qj4wbJ0H4MyJ0oJX_2R9DnevmZsmY9Jgf_sAfoYb7jUGR8qcuv6c8eybO9DuaqkassCtWsJV5GWOp184kRZfykZ1mzb12MkklC9kb9h9cokhEmpzO6RJtD2Rfx8"
            alt="The Lab Pilates Studio"
            className="h-8 md:h-10 object-contain"
          />
        </div>
      </nav>

      {/* Main Content */}
      <main className="grow flex flex-col items-center justify-center pt-32 pb-12 px-[24px]">
        <div className="max-w-3xl w-full text-center flex flex-col items-center">
          {/* Logo Brand Anchor */}
          <div className="mb-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVsZEoEpEPBL7vgavnQoueKHeK5oSygAHfkRJSvTQnTJM0VOtiXXQetwkNX-PKSV2DSTQSzY1CAxF9OPnSZ8JelwFTAduG8j-NHbnxgWD2P1ps3MJK_rt02_IwguM2tYpc5dLM4_aQ48nFx9GsoB338GIE1oSlbgglbedqUrUqH1e517iEI-5GRPiJqgXhXukJAiEWey744fFitENRSdQkH1ZvlpndlRARCnqX5QBDRthcJ0r1dEAzlPfRbTmcOadTj_Dwb8exUTA"
              alt="The Lab Pilates Studio Logo"
              className="w-32 md:w-40 object-contain mx-auto grayscale opacity-90"
            />
          </div>

          {/* Headline */}
          <h1 className="font-headline text-headline-xl text-soft-charcoal mb-6">
            Nos estamos preparando para ti
          </h1>

          {/* Description */}
          <p className="font-body text-body-lg text-on-surface-variant max-w-xl mx-auto mb-10 leading-relaxed">
            Nuestro sistema de reservas está en una fase de refinamiento para
            garantizar que tu experiencia en el estudio sea tan fluida y precisa
            como tu práctica.
          </p>

          {/* CTA Button */}
          <Link
            href="/"
            className="group relative inline-flex items-center gap-3 bg-transparent border border-outline px-10 py-4 rounded-full text-[12px] font-semibold uppercase tracking-widest text-soft-charcoal hover:bg-soft-charcoal hover:text-plaster-white transition-all duration-500"
          >
            <span>Volver al inicio</span>
            <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">
              arrow_forward
            </span>
          </Link>

          {/* Decorative Line */}
          <div className="mt-24 opacity-10">
            <div className="w-px h-24 bg-soft-charcoal mx-auto" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-12 px-[24px] bg-surface-cream flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto mt-auto gap-8">
        <div className="text-center md:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDn7LbowSjjomK87SmSrlVE8BfycKRTegAhIw5FRc4P-SNl18OXT1JpSnwSCfJvIy6XuNlnPPLza_nCirv-z0cX_zCOs6af2QO6tCwVhO3PpAoUCkBFD2qcXEmwhObFZzdiyS5cn4KyH68Sql4maUSatJtnAhdWzm7uIIfbhvKEYIyzNxHRV0v5CazVIyy72PCxfk5p85MSI6njZBcstAdRGBxXnsVi6dLIIUPFcbj6giOwl7Gbfbm81cA7XFLFR9aY-mij0FeXtas"
            alt="The Lab Pilates Studio"
            className="h-10 object-contain mb-4 mx-auto md:mx-0"
          />
          <p className="text-[16px] text-on-surface-variant">
            © 2026 The Lab Pilates Studio. Huajuapan de León, Oaxaca.
          </p>
        </div>

        <div className="flex gap-8">
          <a
            href="#"
            className="text-[12px] font-semibold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
          >
            Instagram
          </a>
          <a
            href="#"
            className="text-[12px] font-semibold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
          >
            Privacy Policy
          </a>
          <a
            href="#"
            className="text-[12px] font-semibold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
          >
            Terms
          </a>
        </div>
      </footer>
    </div>
  )
}
