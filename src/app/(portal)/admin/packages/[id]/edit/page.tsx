import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getAdminPackage } from '@/lib/queries/packages';
import { PackageForm } from '@/components/admin/packages/PackageForm';

export default async function AdminEditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  const { id } = await params;
  const pkg = await getAdminPackage(session, id);
  if (!pkg) notFound();

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Editar {pkg.name}</h1>
      <PackageForm pkg={pkg} />
    </div>
  );
}
