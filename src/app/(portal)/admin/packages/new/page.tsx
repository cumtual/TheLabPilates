import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { PackageForm } from '@/components/admin/packages/PackageForm';

export default async function AdminNewPackagePage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Nuevo paquete</h1>
      <PackageForm />
    </div>
  );
}
