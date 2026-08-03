import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import PortalNav from '@/components/layout/PortalNav';

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen bg-surface-container-low">
      <PortalNav role="client" userName={session.email} />
      <main className="pt-16 md:pt-0 md:ml-64 p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
