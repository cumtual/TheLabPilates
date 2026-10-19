import Link from 'next/link';
import { MenuManager } from '@/components/cafeteria/MenuManager';
import { loadAdminMenu } from '@/modules/cafeteria/presentation/queries';

export const dynamic = 'force-dynamic';

/** Categorías y productos (SPEC-CAFETERIA §8.2). Cada cambio actualiza /menu al instante (D7). */
export default async function AdminCafeteriaMenuPage() {
  const menu = await loadAdminMenu();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-on-surface">Menú</h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Categorías padre (Bebidas, Comida…) con sus subcategorías. Los cambios se ven al instante en el{' '}
          <Link href="/menu" className="text-primary underline underline-offset-2">
            menú público
          </Link>
          .
        </p>
      </div>
      <MenuManager menu={menu} />
    </div>
  );
}
