import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { PublicMenu } from '@/components/cafeteria/PublicMenu';
import { getCachedMenu } from '@/modules/cafeteria/presentation/public-menu';

export const metadata: Metadata = {
  title: 'Menú de la cafetería',
  description: 'Bebidas y comida de la cafetería de The Lab Pilates Studio.',
};

/**
 * Menú público (SPEC-CAFETERIA §7). Dinámica para que `next build` no consulte la BD (H7);
 * los datos salen del caché, que solo se invalida cuando el admin cambia el menú (D7).
 */
export const dynamic = 'force-dynamic';

export default async function MenuPage() {
  const sections = await getCachedMenu();
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-section-gap px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-headline text-headline-xl text-soft-charcoal mb-2">Menú</h1>
          <p className="text-[15px] text-on-surface-variant mb-10">Cafetería de The Lab Pilates Studio.</p>
          <PublicMenu sections={sections} />
        </div>
      </main>
      <Footer />
      <div className="grain" />
    </>
  );
}
