import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { dashboardForRole } from '@/lib/types/roles';
import PortalNav from '@/components/layout/PortalNav';

/** Portal del rol `barra` (SPEC-CAFETERIA §8.1). El admin usa la misma caja en /admin/cafeteria/caja. */
export default async function BarraLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'barra') redirect(dashboardForRole(session.role));

  return (
    <div className="min-h-screen bg-surface-container-low">
      <PortalNav role="barra" userName={session.email} />
      <main className="pt-16 md:pt-0 md:ml-64 p-4 md:p-6">{children}</main>
    </div>
  );
}
