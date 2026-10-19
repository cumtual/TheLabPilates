import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { CafeteriaTabs } from '@/components/cafeteria/CafeteriaTabs';

/** Sección «Cafetería» del admin (SPEC-CAFETERIA §8.2). Solo admin; `barra` usa /barra. */
export default async function AdminCafeteriaLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');
  return (
    <div className="space-y-5">
      <CafeteriaTabs />
      {children}
    </div>
  );
}
