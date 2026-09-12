import type { ReactNode } from 'react';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

interface LegalShellProps {
  title: string;
  subtitle?: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalShell({ title, subtitle, lastUpdated, children }: LegalShellProps) {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-section-gap px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors mb-10"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Volver al inicio
          </Link>

          <h1 className="font-headline text-headline-xl text-soft-charcoal mb-3">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[15px] leading-relaxed text-on-surface-variant mb-2">
              {subtitle}
            </p>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-widest text-outline">
            Última actualización: {lastUpdated}
          </p>

          <div className="mt-4">{children}</div>
        </article>
      </main>
      <Footer />
      <div className="grain" />
    </>
  );
}

interface LegalSectionProps {
  title: string;
  children: ReactNode;
}

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="mt-10">
      <h2 className="font-headline text-2xl text-soft-charcoal mb-3">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-on-surface-variant">
        {children}
      </div>
    </section>
  );
}
