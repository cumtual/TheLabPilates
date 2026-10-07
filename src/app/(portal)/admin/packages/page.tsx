import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getAdminPackages } from '@/lib/queries/packages';
import { PackageList } from '@/components/admin/packages/PackageList';

/** Catálogo de paquetes (SPEC-SPECIAL-PACKAGES §7.2). Solo admin. */
export default async function AdminPackagesPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  const packages = await getAdminPackages(session);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-on-surface">Paquetes</h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Lo que se muestra en la landing y en la tienda. Los cambios aplican solo a compras nuevas.
        </p>
      </div>
      <PackageList packages={packages} />
    </div>
  );
}
